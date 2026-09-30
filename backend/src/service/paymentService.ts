import Razorpay from 'razorpay'
import Stripe from 'stripe'
import crypto from 'crypto'
import { InvoiceModel, SubscriptionModel } from '../model/billingModel'
import orgModel from '../model/orgModel'
import { SubscriptionPlan } from '../types/billingTypes'
import logger from '../util/loger'
import config from '../config/config'

// ─── SDK instances (lazy-init so missing keys don't crash on startup) ─────────

let _razorpay: Razorpay | null = null
const getRazorpay = (): Razorpay => {
    if (_razorpay) return _razorpay
    const keyId = config.PAYMENT.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || ''
    const keySecret = config.PAYMENT.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET || ''
    if (!keyId || !keySecret) throw new Error('Razorpay keys not configured in environment')
    _razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
    return _razorpay
}

let _stripe: Stripe | null = null
const getStripe = (): Stripe => {
    if (_stripe) return _stripe
    const secretKey = config.PAYMENT.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || ''
    if (!secretKey) throw new Error('Stripe secret key not configured in environment')
    _stripe = new Stripe(secretKey, { apiVersion: '2026-08-26.dahlia' })
    return _stripe
}

// Payment verification failures: the client's fault (400), not a server error
export class PaymentError extends Error {}

// ─── Plan pricing ─────────────────────────────────────────────────────────────

const PLAN_PRICES: Record<SubscriptionPlan, { monthly: number; yearly: number }> = {
    free: { monthly: 0, yearly: 0 },
    starter: { monthly: 2999, yearly: 29990 },
    growth: { monthly: 9999, yearly: 99990 },
    agency: { monthly: 19999, yearly: 199990 }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const paymentService = {
    /**
     * Creates a real payment session:
     *  - Razorpay: calls razorpay.orders.create → returns orderId + key_id
     *  - Stripe:   calls stripe.paymentIntents.create → returns clientSecret + publishable key
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
            const order = await rzp.orders.create({
                amount: amount * 100,
                currency: 'INR',
                receipt: `rcpt_${orgId}_${Date.now()}`,
                notes: { plan, billingCycle, orgId, userId }
            })

            logger.info(`[PaymentService] Razorpay order created: ${order.id} for plan ${plan} (₹${amount})`)

            return {
                isFree: false,
                gateway: 'razorpay',
                orderId: order.id,
                amount,
                currency: 'INR',
                plan,
                billingCycle,
                description,
                // key_id is the publishable-equivalent for Razorpay — safe to send to frontend
                keyId: config.PAYMENT.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || ''
            }
        }

        // ── Stripe ────────────────────────────────────────────────────────────
        if (gateway === 'stripe') {
            const stripe = getStripe()
            // Stripe requires amount in smallest currency unit (paise for INR)
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount * 100,
                currency: 'inr',
                description,
                metadata: { plan, billingCycle, orgId, userId }
            })

            logger.info(`[PaymentService] Stripe PaymentIntent created: ${paymentIntent.id} for plan ${plan} (₹${amount})`)

            return {
                isFree: false,
                gateway: 'stripe',
                orderId: paymentIntent.id,           // used as reference on confirm
                clientSecret: paymentIntent.client_secret, // sent to frontend for stripe.confirmCardPayment()
                amount,
                currency: 'INR',
                plan,
                billingCycle,
                description,
                publishableKey: config.PAYMENT.STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || ''
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
     *  - Stripe:   retrieves PaymentIntent from Stripe API and checks status
     *  - Mock:     development only (ALLOW_MOCK_PAYMENTS)
     */
    confirmPayment: async (params: {
        userId: string
        orgId: string
        plan: SubscriptionPlan
        billingCycle?: 'monthly' | 'yearly'
        gateway?: 'razorpay' | 'stripe' | 'mock'
        gatewayOrderId?: string      // Razorpay: razorpay_order_id | Stripe: paymentIntent.id
        gatewayPaymentId?: string    // Razorpay: razorpay_payment_id
        gatewaySignature?: string    // Razorpay: razorpay_signature (HMAC)
    }) => {
        const {
            userId, orgId, plan, billingCycle = 'monthly',
            gateway,
            gatewayOrderId, gatewayPaymentId, gatewaySignature
        } = params

        let paymentMethod = 'Unknown'
        // Charged amount comes from the gateway (or the price list for sandbox), never from the client
        let amount = 0
        // The plan/cycle/org must be the ones the order was created for, otherwise a cheap
        // payment could be replayed to activate a pricier plan
        const assertOrderMatches = (notes: Record<string, unknown> | null | undefined) => {
            if (notes?.plan !== plan || notes?.billingCycle !== billingCycle || notes?.orgId !== orgId) {
                throw new PaymentError('Payment does not match the selected plan')
            }
        }

        // ── Razorpay signature verification ───────────────────────────────────
        if (gateway === 'razorpay') {
            if (!gatewayOrderId || !gatewayPaymentId || !gatewaySignature) {
                throw new Error('Razorpay: order_id, payment_id and signature are required for verification')
            }
            const keySecret = config.PAYMENT.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET || ''
            const expectedSignature = crypto
                .createHmac('sha256', keySecret)
                .update(`${gatewayOrderId}|${gatewayPaymentId}`)
                .digest('hex')

            if (expectedSignature !== gatewaySignature) {
                throw new PaymentError('Razorpay payment signature verification failed — possible fraud attempt')
            }
            const order = await getRazorpay().orders.fetch(gatewayOrderId)
            assertOrderMatches(order.notes as Record<string, unknown>)
            amount = Number(order.amount) / 100
            paymentMethod = 'Razorpay'
            logger.info(`[PaymentService] Razorpay payment verified: ${gatewayPaymentId}`)
        }

        // ── Stripe PaymentIntent verification ─────────────────────────────────
        else if (gateway === 'stripe') {
            if (!gatewayOrderId) {
                throw new Error('Stripe: paymentIntent.id is required for verification')
            }
            const stripe = getStripe()
            const intent = await stripe.paymentIntents.retrieve(gatewayOrderId)
            if (intent.status !== 'succeeded') {
                throw new PaymentError(`Stripe payment not succeeded (status: ${intent.status})`)
            }
            assertOrderMatches(intent.metadata)
            amount = intent.amount / 100
            paymentMethod = 'Stripe Card'
            logger.info(`[PaymentService] Stripe PaymentIntent verified: ${gatewayOrderId}`)
        }

        // ── Mock (development only) ───────────────────────────────────────────
        else if (gateway === 'mock' && config.ALLOW_MOCK_PAYMENTS) {
            amount = billingCycle === 'yearly' ? PLAN_PRICES[plan].yearly : PLAN_PRICES[plan].monthly
            paymentMethod = 'Sandbox'
            logger.info(`[PaymentService] Mock payment confirmed for plan ${plan}`)
        } else {
            throw new PaymentError(`Unsupported payment gateway: ${gateway}`)
        }

        // A verified payment can only activate a plan once
        const paymentRef = gatewayPaymentId || gatewayOrderId
        if (paymentRef && (await InvoiceModel.exists({ gatewayPaymentId: paymentRef }))) {
            throw new PaymentError('This payment has already been used')
        }

        // ── Activate subscription ─────────────────────────────────────────────
        await orgModel.findByIdAndUpdate(orgId, { plan })

        // Renewing the same plan before it lapses extends it from the current expiry, so no paid days are lost
        const periodDays = billingCycle === 'yearly' ? 365 : 30
        const existing = await SubscriptionModel.findOne({ orgId }).lean()
        const now = new Date()
        const currentPeriodStart =
            existing?.plan === plan && existing.status === 'active' && existing.expiresAt && existing.expiresAt > now
                ? existing.expiresAt
                : now
        const currentPeriodEnd = new Date(currentPeriodStart.getTime() + periodDays * 24 * 60 * 60 * 1000)

        const sub = await SubscriptionModel.findOneAndUpdate(
            { orgId },
            {
                userId,
                plan,
                status: 'active',
                billingCycle,
                gatewaySubscriptionId: gatewayPaymentId || gatewayOrderId || `sub_${Date.now()}`,
                currentPeriodStart,
                currentPeriodEnd,
                expiresAt: currentPeriodEnd,
                cancelAtPeriodEnd: false
            },
            { upsert: true, new: true }
        )

        // ── Generate Invoice ──────────────────────────────────────────────────
        const invoiceCount = await InvoiceModel.countDocuments()
        const invoiceNumber = `INV-${new Date().getFullYear()}-${(invoiceCount + 1001).toString()}`

        const invoice = await InvoiceModel.create({
            invoiceNumber,
            orgId,
            userId,
            plan,
            amount,
            currency: 'INR',
            status: 'paid',
            paymentMethod,
            gatewayPaymentId: gatewayPaymentId || gatewayOrderId || `pay_${Date.now()}`,
            paidAt: new Date(),
            items: [
                {
                    description: `GEO Platform - ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan (${billingCycle})`,
                    amount
                }
            ]
        })

        logger.info(`[PaymentService] Subscription activated for Org ${orgId}. Invoice: ${invoiceNumber}`)

        return { subscription: sub, invoice }
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
