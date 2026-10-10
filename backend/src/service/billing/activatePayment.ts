import paymentModel from '../../model/paymentModel'
import { InvoiceModel, SubscriptionModel } from '../../model/billingModel'
import orgModel from '../../model/orgModel'
import userModel from '../../model/userModel'
import { PaymentError, PLAN_PRICES } from './prices'
import { nextInvoiceNumber } from './invoiceNumber'
import { getSeller } from './seller'
import type { SubscriptionPlan, IInvoice } from '../../types/billingTypes'
import logger from '../../util/loger'
import lockModel from '../../model/lockModel'

// Not finished yet (another caller is on it): try again shortly, unlike a PaymentError
export class ActivationPendingError extends Error {}

export interface IOrderInfo {
    orgId: string
    userId: string
    plan: SubscriptionPlan
    billingCycle: 'monthly' | 'yearly'
    amount: number
}

// Plan, cycle and org come from the order we created; the amount must be today's price for them
export const orderInfoFromRazorpay = (order: { id: string; amount: number | string; notes?: Record<string, unknown> }): IOrderInfo => {
    const n = order.notes || {}
    const plan = n.plan as SubscriptionPlan
    const billingCycle = n.billingCycle as 'monthly' | 'yearly'
    if (!PLAN_PRICES[plan] || !['monthly', 'yearly'].includes(billingCycle) || !n.orgId || !n.userId) {
        throw new PaymentError(`Order ${order.id} has no plan details`)
    }
    const amount = Number(order.amount) / 100
    if (amount !== PLAN_PRICES[plan][billingCycle]) throw new PaymentError(`Order ${order.id} amount does not match the ${plan} price`)
    return { orgId: String(n.orgId), userId: String(n.userId), plan, billingCycle, amount }
}

export interface IActivateInput {
    paymentId: string
    orderId: string
    order: IOrderInfo
    gateway: 'razorpay' | 'stripe' | 'mock'
    paymentMethod: string
    source: 'browser' | 'webhook'
}

export interface IActivateDeps {
    now?: () => Date
    waitMs?: number
    staleMs?: number
    sendInvoice?: (invoiceId: string) => Promise<unknown>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const resultOf = async (invoiceId: unknown, orgId: string) => ({
    subscription: await SubscriptionModel.findOne({ orgId }).lean(),
    invoice: (await InvoiceModel.findById(invoiceId).lean()) as unknown as IInvoice
})

// One activation at a time per org, so two different payments can't both read the same expiry
const withOrgLock = async <T>(orgId: string, fn: () => Promise<T>): Promise<T> => {
    const _id = `sub:${orgId}`
    const deadline = Date.now() + 15_000
    for (;;) {
        try {
            await lockModel.create({ _id, at: new Date() })
            break
        } catch (err) {
            if ((err as { code?: number }).code !== 11000) throw err
            // A holder that died leaves a lock older than a minute: clear it
            await lockModel.deleteOne({ _id, at: { $lt: new Date(Date.now() - 60_000) } })
            if (Date.now() > deadline) throw new ActivationPendingError('Another payment for this workspace is being activated')
            await sleep(100)
        }
    }
    try {
        return await fn()
    } finally {
        await lockModel.deleteOne({ _id }).catch(() => undefined)
    }
}

// Extends the plan and issues the invoice; only the claimer gets here. Safe to run again for the
// same payment after a crash: an extension or invoice already made for it is reused, never repeated
const fulfil = async (input: IActivateInput, now: Date) => {
    const { order } = input
    const prior = await InvoiceModel.findOne({ gatewayPaymentId: input.paymentId })
    if (prior) return prior
    const { start, end } = await withOrgLock(order.orgId, async () => {
        const existing = await SubscriptionModel.findOne({ orgId: order.orgId }).lean()
        if (existing?.gatewaySubscriptionId === input.paymentId && existing.currentPeriodStart && existing.currentPeriodEnd) {
            return { start: existing.currentPeriodStart, end: existing.currentPeriodEnd }
        }
        // Renewing the same plan before it lapses extends it from the current expiry, so no paid days are lost
        const from =
            existing?.plan === order.plan && existing.status === 'active' && existing.expiresAt && existing.expiresAt > now ? existing.expiresAt : now
        const to = new Date(from.getTime() + (order.billingCycle === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000)
        await orgModel.findByIdAndUpdate(order.orgId, { plan: order.plan })
        await SubscriptionModel.findOneAndUpdate(
            { orgId: order.orgId },
            {
                userId: order.userId,
                plan: order.plan,
                status: 'active',
                billingCycle: order.billingCycle,
                gatewaySubscriptionId: input.paymentId,
                currentPeriodStart: from,
                currentPeriodEnd: to,
                expiresAt: to,
                cancelAtPeriodEnd: false
            },
            { upsert: true, new: true }
        )
        return { start: from, end: to }
    })
    const [seller, user, org] = await Promise.all([getSeller(), userModel.findById(order.userId).lean(), orgModel.findById(order.orgId).lean()])
    const planName = order.plan.charAt(0).toUpperCase() + order.plan.slice(1)
    return InvoiceModel.create({
        invoiceNumber: await nextInvoiceNumber(now),
        orgId: order.orgId,
        userId: order.userId,
        plan: order.plan,
        amount: order.amount,
        currency: 'INR',
        status: 'paid',
        paymentMethod: input.paymentMethod,
        gateway: input.gateway,
        gatewayPaymentId: input.paymentId,
        gatewayOrderId: input.orderId,
        paidAt: now,
        period: { start, end },
        seller,
        buyer: { name: user?.name || '', email: user?.email || '', orgName: (org as { name?: string } | null)?.name || '' },
        taxNote: seller.gstin ? '' : 'GST not charged: supplier is not registered under GST.',
        items: [{ description: `Signal AI ${planName} plan (${order.billingCycle})`, amount: order.amount }]
    })
}

// The one way a payment turns into a plan: the first caller claims it, the rest get the same result
export const activatePayment = async (input: IActivateInput, deps: IActivateDeps = {}) => {
    const now = deps.now ?? (() => new Date())
    const waitMs = deps.waitMs ?? 10_000
    const staleMs = deps.staleMs ?? 2 * 60 * 1000
    const { order } = input

    let claimed = false
    try {
        await paymentModel.create({
            ...order,
            paymentId: input.paymentId,
            orderId: input.orderId,
            gateway: input.gateway,
            source: input.source,
            claimedAt: now()
        })
        claimed = true
    } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err
    }

    if (!claimed) {
        const deadline = Date.now() + waitMs
        for (;;) {
            const p = await paymentModel.findOne({ paymentId: input.paymentId }).lean()
            if (p?.status === 'done') return resultOf(p.invoiceId, order.orgId)
            // A claimer that died mid-way: take over after staleMs
            const took = await paymentModel.findOneAndUpdate(
                { paymentId: input.paymentId, status: 'processing', claimedAt: { $lt: new Date(now().getTime() - staleMs) } },
                { $set: { claimedAt: now(), source: input.source } },
                { new: true }
            )
            if (took) break
            if (Date.now() > deadline) throw new ActivationPendingError('This payment is still being activated. Please refresh in a minute.')
            await sleep(150)
        }
    }

    const invoice = await fulfil(input, now())
    await paymentModel.updateOne({ paymentId: input.paymentId }, { $set: { status: 'done', invoiceId: invoice._id, doneAt: now() } })
    logger.info(
        `[billing] Payment ${input.paymentId} activated ${order.plan} for org ${order.orgId} (${input.source}); invoice ${invoice.invoiceNumber}`
    )
    // The PDF (Chrome) and mail take seconds: they run after the answer, never holding up the customer
    if (deps.sendInvoice) void deps.sendInvoice(String(invoice._id)).catch((e) => logger.warn('[billing] invoice email failed', { meta: e }))
    return resultOf(invoice._id, order.orgId)
}
