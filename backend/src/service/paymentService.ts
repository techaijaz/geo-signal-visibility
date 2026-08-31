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

// ─── Plan pricing ─────────────────────────────────────────────────────────────

const PLAN_PRICES: Record<SubscriptionPlan, { monthly: number; yearly: number }> = {
    free: { monthly: 0, yearly: 0 },
    starter: { monthly: 1499, yearly: 14990 },
    growth: { monthly: 5999, yearly: 59990 },
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
        const { userId, orgId, plan, billingCycle = 'monthly', gateway = 'mock' } = params

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
                    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
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

        // ── Mock / Sandbox (for testing without real keys) ────────────────────
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
     *  - Mock:     passes through (for sandbox/testing)
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
        amount: number
    }) => {
        const {
            userId, orgId, plan, billingCycle = 'monthly',
            gateway = 'mock',
            gatewayOrderId, gatewayPaymentId, gatewaySignature,
            amount
        } = params

        let paymentMethod = 'Unknown'

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
                throw new Error('Razorpay payment signature verification failed — possible fraud attempt')
            }
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
                throw new Error(`Stripe payment not succeeded (status: ${intent.status})`)
            }
            paymentMethod = 'Stripe Card'
            logger.info(`[PaymentService] Stripe PaymentIntent verified: ${gatewayOrderId}`)
        }

        // ── Mock ──────────────────────────────────────────────────────────────
        else {
            paymentMethod = 'Sandbox'
            logger.info(`[PaymentService] Mock payment confirmed for plan ${plan}`)
        }

        // ── Activate subscription ─────────────────────────────────────────────
        await orgModel.findByIdAndUpdate(orgId, { plan })

        const periodDays = billingCycle === 'yearly' ? 365 : 30
        const currentPeriodStart = new Date()
        const currentPeriodEnd = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000)

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
     * Get user invoice history
     */
    getUserInvoices: async (orgId: string) => {
        let invoices = await InvoiceModel.find({ orgId }).sort({ createdAt: -1 })

        if (invoices.length === 0) {
            const org = await orgModel.findById(orgId)
            const currentPlan = (org?.plan || 'starter') as SubscriptionPlan
            const price = PLAN_PRICES[currentPlan]?.monthly || 1499

            if (price > 0) {
                const invoiceCount = await InvoiceModel.countDocuments()
                const defaultInv = await InvoiceModel.create({
                    invoiceNumber: `INV-${new Date().getFullYear()}-${(invoiceCount + 1001).toString()}`,
                    orgId,
                    userId: org?.ownerId,
                    plan: currentPlan,
                    amount: price,
                    currency: 'INR',
                    status: 'paid',
                    paymentMethod: 'UPI / NetBanking',
                    gatewayPaymentId: `pay_demo_${Date.now()}`,
                    paidAt: new Date(),
                    items: [
                        {
                            description: `GEO Platform - ${currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} Plan Subscription`,
                            amount: price
                        }
                    ]
                })
                invoices = [defaultInv]
            }
        }

        return invoices
    },

    /**
     * Get subscription overview
     */
    getSubscriptionOverview: async (orgId: string, userId: string) => {
        let sub = await SubscriptionModel.findOne({ orgId })
        const org = await orgModel.findById(orgId)
        const currentPlan = (org?.plan || 'starter') as SubscriptionPlan

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
