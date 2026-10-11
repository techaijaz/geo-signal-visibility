import Razorpay from 'razorpay'
import crypto from 'crypto'
import { InvoiceModel, SubscriptionModel } from '../model/billingModel'
import orgModel from '../model/orgModel'
import { SubscriptionPlan } from '../types/billingTypes'
import logger from '../util/loger'
import config from '../config/config'
import { PaymentError, PLAN_PRICES } from './billing/prices'
import { activatePayment, orderInfoFromRazorpay } from './billing/activatePayment'
import checkoutOrderModel from '../model/checkoutOrderModel'
import { paymentMethodLabel, sendInvoiceEmail } from './billing/invoiceDoc'
import paymentModel from '../model/paymentModel'

// ─── SDK instances (lazy-init so missing keys don't crash on startup) ─────────

let _razorpay: Razorpay | null = null
export const getRazorpay = (): Razorpay => {
    if (_razorpay) return _razorpay
    const keyId = config.PAYMENT.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || ''
    const keySecret = config.PAYMENT.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET || ''
    if (!keyId || !keySecret) throw new Error('Razorpay keys not configured in environment')
    _razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
    return _razorpay
}

// PaymentError and the price list live in billing/prices so billing/* can use them without a cycle
export { PaymentError, PLAN_PRICES }

// ─── Checkout orders ──────────────────────────────────────────────────────────

const REUSE_MS = 15 * 60 * 1000
const opening = new Map<string, Promise<string>>()

// Two tabs or a double click within 15 min get the same unpaid Razorpay order
export const reuseOrCreateOrder = async (
    input: { orgId: string; userId: string; plan: SubscriptionPlan; billingCycle: 'monthly' | 'yearly'; amount: number },
    create: () => Promise<{ id: string }>,
    now = new Date()
): Promise<string> => {
    const key = `${input.orgId}:${input.plan}:${input.billingCycle}`
    // Parallel requests in this process share one creation
    const inflight = opening.get(key)
    if (inflight) return inflight
    const work = (async () => {
        const recent = await checkoutOrderModel
            .find({
                orgId: input.orgId,
                plan: input.plan,
                billingCycle: input.billingCycle,
                amount: input.amount,
                createdAt: { $gt: new Date(now.getTime() - REUSE_MS), $lte: now }
            })
            .sort({ createdAt: -1 })
            .lean()
        for (const r of recent) if (!(await paymentModel.exists({ orderId: r.orderId }))) return r.orderId
        const o = await create()
        await checkoutOrderModel.create({
            orgId: input.orgId,
            plan: input.plan,
            billingCycle: input.billingCycle,
            amount: input.amount,
            orderId: o.id,
            createdAt: now
        })
        return o.id
    })()
    opening.set(key, work)
    try {
        return await work
    } finally {
        opening.delete(key)
    }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const paymentService = {
    /**
     * Creates a real payment session:
     *  - Razorpay: calls razorpay.orders.create → returns orderId + key_id
     *  - Stripe:   not offered (India-first billing); refused
     *  - Free plan: immediately activates, no gateway needed
     */
    createCheckoutSession: async (params: {
        userId: string
        orgId: string
        plan: SubscriptionPlan
        billingCycle?: 'monthly' | 'yearly'
        gateway?: 'razorpay' | 'stripe' | 'mock'
    }) => {
        const { userId, orgId, plan, billingCycle = 'monthly', gateway } = params
        if (gateway === 'stripe') throw new PaymentError('Card payments by Stripe are not available. Please pay with Razorpay.')

        const priceObj = PLAN_PRICES[plan] || PLAN_PRICES.starter
        const amount = billingCycle === 'yearly' ? priceObj.yearly : priceObj.monthly

        // Free plan — activate immediately
        if (amount === 0) {
            await orgModel.findByIdAndUpdate(orgId, { plan })
            await SubscriptionModel.findOneAndUpdate(
                { orgId },
                {
                    userId,
                    plan,
                    status: 'active',
                    billingCycle,
                    currentPeriodStart: new Date(),
                    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                    expiresAt: null
                },
                { upsert: true, new: true }
            )
            return { isFree: true, message: 'Downgraded to Free tier successfully' }
        }

        const description = `GEO Platform ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan (${billingCycle})`

        // ── Razorpay ──────────────────────────────────────────────────────────
        if (gateway === 'razorpay') {
            const rzp = getRazorpay()
            // Razorpay requires amount in paise (INR × 100)
            const orderId = await reuseOrCreateOrder(
                { orgId, userId, plan, billingCycle, amount },
                () =>
                    rzp.orders.create({
                        amount: amount * 100,
                        currency: 'INR',
                        receipt: `rcpt_${orgId}_${Date.now()}`,
                        notes: { plan, billingCycle, orgId, userId }
                    }) as unknown as Promise<{ id: string }>
            )

            logger.info(`[PaymentService] Razorpay order ${orderId} for plan ${plan} (₹${amount})`)

            return {
                isFree: false,
                gateway: 'razorpay',
                orderId,
                amount,
                currency: 'INR',
                plan,
                billingCycle,
                description,
                // key_id is the publishable-equivalent for Razorpay — safe to send to frontend
                keyId: config.PAYMENT.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || ''
            }
        }

        // ── Mock / Sandbox (development only) ─────────────────────────────────
        if (gateway !== 'mock' || !config.ALLOW_MOCK_PAYMENTS) {
            throw new PaymentError(`Unsupported payment gateway: ${gateway}`)
        }
        const mockOrderId = `mock_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`
        logger.info(`[PaymentService] Mock checkout: ${mockOrderId} for plan ${plan} (₹${amount})`)
        return {
            isFree: false,
            gateway: 'mock',
            orderId: mockOrderId,
            clientSecret: null,
            amount,
            currency: 'INR',
            plan,
            billingCycle,
            description,
            keyId: 'mock_key'
        }
    },

    /**
     * Verifies payment and activates subscription:
     *  - Razorpay: verifies HMAC-SHA256 signature
     *  - Stripe:   not offered; refused
     *  - Mock:     development only (ALLOW_MOCK_PAYMENTS)
     */
    confirmPayment: async (params: {
        userId: string
        orgId: string
        plan: SubscriptionPlan
        billingCycle?: 'monthly' | 'yearly'
        gateway?: 'razorpay' | 'stripe' | 'mock'
        gatewayOrderId?: string // Razorpay: razorpay_order_id | Stripe: paymentIntent.id
        gatewayPaymentId?: string // Razorpay: razorpay_payment_id
        gatewaySignature?: string // Razorpay: razorpay_signature (HMAC)
    }) => {
        const { userId, orgId, plan, billingCycle = 'monthly', gateway, gatewayOrderId, gatewayPaymentId, gatewaySignature } = params
        // Stripe isn't offered (India-first billing); refusing it closes replays of one PaymentIntent
        if (gateway === 'stripe') throw new PaymentError('Card payments by Stripe are not available. Please pay with Razorpay.')

        let paymentMethod = 'Unknown'
        // Charged amount comes from the gateway (or the price list for sandbox), never from the client
        let amount = 0

        // ── Razorpay signature verification ───────────────────────────────────
        if (gateway === 'razorpay') {
            if (!gatewayOrderId || !gatewayPaymentId || !gatewaySignature) {
                throw new Error('Razorpay: order_id, payment_id and signature are required for verification')
            }
            const keySecret = config.PAYMENT.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET || ''
            const expectedSignature = crypto.createHmac('sha256', keySecret).update(`${gatewayOrderId}|${gatewayPaymentId}`).digest('hex')

            if (expectedSignature !== gatewaySignature) {
                throw new PaymentError('Razorpay payment signature verification failed — possible fraud attempt')
            }
            const info = orderInfoFromRazorpay(await getRazorpay().orders.fetch(gatewayOrderId))
            if (info.plan !== plan || info.billingCycle !== billingCycle || info.orgId !== orgId)
                throw new PaymentError('Payment does not match the selected plan')
            amount = info.amount
            // The method (UPI, card, netbanking…) as Razorpay recorded it, for the invoice
            paymentMethod = await getRazorpay()
                .payments.fetch(gatewayPaymentId)
                .then((p) => paymentMethodLabel(p.method as string))
                .catch(() => 'Razorpay')
            logger.info(`[PaymentService] Razorpay payment verified: ${gatewayPaymentId}`)
        }
        // ── Mock (development only) ───────────────────────────────────────────
        else if (gateway === 'mock' && config.ALLOW_MOCK_PAYMENTS) {
            amount = billingCycle === 'yearly' ? PLAN_PRICES[plan].yearly : PLAN_PRICES[plan].monthly
            paymentMethod = 'Sandbox'
            logger.info(`[PaymentService] Mock payment confirmed for plan ${plan}`)
        } else {
            throw new PaymentError(`Unsupported payment gateway: ${gateway}`)
        }

        // One payment activates one plan, however many times it is confirmed (browser, webhook)
        const ref = gatewayPaymentId || gatewayOrderId || `mock_${Date.now()}`
        return activatePayment(
            {
                paymentId: ref,
                orderId: gatewayOrderId || ref,
                order: { orgId, userId, plan, billingCycle, amount },
                gateway: gateway as 'razorpay' | 'stripe' | 'mock',
                paymentMethod,
                source: 'browser'
            },
            { sendInvoice: sendInvoiceEmail }
        )
    },

    /**
     * Move every org whose paid period has ended back to the Free plan.
     * Runs from the scheduler tick; safe to run repeatedly and from several workers.
     */
    expireLapsedSubscriptions: async (now: Date = new Date()) => {
        const lapsed = await SubscriptionModel.find({ expiresAt: { $lte: now }, plan: { $ne: 'free' } }).lean()
        for (const sub of lapsed) {
            // Guarded update so a renewal that lands at the same moment is never overwritten
            const res = await SubscriptionModel.updateOne(
                { _id: sub._id, expiresAt: sub.expiresAt },
                { $set: { plan: 'free', status: 'expired', expiresAt: null } }
            )
            if (res.modifiedCount === 0) continue
            await orgModel.findByIdAndUpdate(sub.orgId, { plan: 'free' })
            logger.info(`[PaymentService] ${sub.plan} plan expired for org ${sub.orgId.toString()}, moved to free`)
        }
        return lapsed.length
    },

    /**
     * Get user invoice history
     */
    getUserInvoices: async (orgId: string) => {
        return InvoiceModel.find({ orgId }).sort({ createdAt: -1 })
    },

    /**
     * Get subscription overview
     */
    getSubscriptionOverview: async (orgId: string, userId: string) => {
        let sub = await SubscriptionModel.findOne({ orgId })
        const org = await orgModel.findById(orgId)
        const currentPlan = (org?.plan || 'free') as SubscriptionPlan

        if (!sub) {
            sub = await SubscriptionModel.create({
                orgId,
                userId,
                plan: currentPlan,
                status: 'active',
                billingCycle: 'monthly',
                currentPeriodStart: new Date(),
                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            })
        } else if (sub.plan !== currentPlan) {
            sub.plan = currentPlan
            await sub.save()
        }

        return sub
    }
}
