import { Request, Response, NextFunction } from 'express'
import { IAuthenticatedRequest } from '../middleware/authentication'
import databseService from '../service/databseService'
import { paymentService, PaymentError } from '../service/paymentService'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import responceseMessage from '../constent/responceseMessage'
import { EUserRole } from '../constent/userConstent'
import { getPlanLimits } from '../config/planLimits'
import { SubscriptionPlan } from '../types/billingTypes'
import { SubscriptionModel } from '../model/billingModel'

const ensureUserOrg = async (userId: string, userName: string) => {
    let org = await databseService.findOrgByOwnerId(userId)
    if (!org) {
        org = await databseService.createOrg({
            name: `${userName}'s Workspace`,
            ownerId: userId,
            whiteLabelEnabled: false,
            plan: 'free'
        })
        await databseService.updateUserOrgId(userId, org._id.toString())
    }
    return org
}

const PLANS_DATA = [
    {
        id: 'free',
        name: 'Free',
        price: '₹0',
        billingPeriod: ' /mo',
        description: 'See the problem before you commit to fixing it.',
        features: [
            '1 brand',
            '3 tracked queries',
            'Weekly scan',
            'ChatGPT, Gemini & Claude',
            '1 site audit re-run per day'
        ],
        buttonText: 'Downgrade'
    },
    {
        id: 'starter',
        name: 'Starter',
        price: '₹2,999',
        billingPeriod: ' /mo',
        description: 'For solo founders and small D2C teams.',
        features: [
            '1 brand',
            '15 tracked queries',
            'Daily scan',
            '1 manual re-scan per day',
            'ChatGPT, Gemini, Claude, Grok & DeepSeek',
            'AI recommendations'
        ],
        buttonText: 'Current plan'
    },
    {
        id: 'growth',
        name: 'Growth',
        price: '₹9,999',
        billingPeriod: ' /mo',
        description: 'For funded startups and growing D2C brands.',
        features: [
            '3 brands',
            '30 tracked queries per brand',
            '3 scans a day',
            '3 manual re-scans per day',
            'ChatGPT, Gemini, Claude, Grok & DeepSeek',
            'AI recommendations',
            'Competitor share-of-voice'
        ],
        buttonText: 'Upgrade'
    },
    {
        id: 'agency',
        name: 'Agency',
        price: 'Custom',
        billingPeriod: '',
        description: 'Manage visibility across multiple client brands.',
        features: [
            'Up to 25 brands, 100 queries each',
            'Scans twice a day',
            'All 6 AIs incl. Perplexity',
            'Priority support',
            'Dedicated onboarding'
        ],
        buttonText: 'Talk to sales'
    }
]

export default {
    getSubscription: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const org = await ensureUserOrg(authenticatedUser._id.toString(), authenticatedUser.name)

            const sub = await paymentService.getSubscriptionOverview(org._id.toString(), authenticatedUser._id.toString())
            const invoices = await paymentService.getUserInvoices(org._id.toString())

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                currentPlan: org.plan || 'free',
                orgId: org._id,
                plans: PLANS_DATA,
                subscription: sub,
                invoices
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    updateSubscription: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { plan } = req.body

            if (!['free', 'starter', 'growth', 'agency'].includes(plan)) {
                return httpError(next, new Error('Invalid plan selected'), req, 422)
            }
            // Only downgrades to Free skip payment; paid plans must go through checkout + confirm
            if (plan !== 'free' && authenticatedUser.role !== EUserRole.ADMIN) {
                return httpError(next, new Error('Paid plans must be purchased through checkout'), req, 403)
            }

            const org = await ensureUserOrg(authenticatedUser._id.toString(), authenticatedUser.name)
            const updatedOrg = await databseService.updateOrgPlan(org._id.toString(), plan)

            await SubscriptionModel.findOneAndUpdate(
                { orgId: org._id },
                {
                    userId: authenticatedUser._id,
                    plan,
                    status: 'active',
                    expiresAt: null
                },
                { upsert: true, new: true }
            )

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                currentPlan: updatedOrg?.plan || plan,
                message: `Successfully changed plan to ${plan}`
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    createCheckoutSession: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { plan, billingCycle = 'monthly', gateway } = req.body

            if (!['free', 'starter', 'growth', 'agency'].includes(plan)) {
                return httpError(next, new Error('Invalid plan'), req, 422)
            }
            if (plan === 'agency') {
                return httpError(next, new Error('The Agency plan is set up by our sales team. Please contact sales.'), req, 403)
            }

            const org = await ensureUserOrg(authenticatedUser._id.toString(), authenticatedUser.name)
            const session = await paymentService.createCheckoutSession({
                userId: authenticatedUser._id.toString(),
                orgId: org._id.toString(),
                plan: plan as SubscriptionPlan,
                billingCycle,
                gateway
            })

            httpResponse(req, res, 200, responceseMessage.SUCCESS, session)
        } catch (error) {
            httpError(next, error, req, error instanceof PaymentError ? 400 : 500)
        }
    },

    confirmPayment: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const {
                plan,
                billingCycle = 'monthly',
                gateway,
                // Razorpay fields
                razorpay_order_id,
                razorpay_payment_id,
                razorpay_signature,
                // Stripe fields
                paymentIntentId
            } = req.body

            if (!['free', 'starter', 'growth', 'agency'].includes(plan)) {
                return httpError(next, new Error('Invalid plan'), req, 422)
            }

            const org = await ensureUserOrg(authenticatedUser._id.toString(), authenticatedUser.name)

            const result = await paymentService.confirmPayment({
                userId: authenticatedUser._id.toString(),
                orgId: org._id.toString(),
                plan: plan as SubscriptionPlan,
                billingCycle,
                gateway,
                // Razorpay
                gatewayOrderId: razorpay_order_id || paymentIntentId,
                gatewayPaymentId: razorpay_payment_id,
                gatewaySignature: razorpay_signature
            })

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                message: 'Payment confirmed & subscription activated!',
                subscription: result.subscription,
                invoice: result.invoice,
                currentPlan: plan
            })
        } catch (error) {
            httpError(next, error, req, error instanceof PaymentError ? 400 : 500)
        }
    },


    getInvoices: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const org = await ensureUserOrg(authenticatedUser._id.toString(), authenticatedUser.name)
            const invoices = await paymentService.getUserInvoices(org._id.toString())

            httpResponse(req, res, 200, responceseMessage.SUCCESS, { invoices })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    getPlanLimits: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const org = await ensureUserOrg(authenticatedUser._id.toString(), authenticatedUser.name)

            const effectivePlan = authenticatedUser.role === EUserRole.ADMIN ? 'agency' : (org.plan || 'free')
            const planLimits = getPlanLimits(effectivePlan as any)

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                plan: effectivePlan,
                limits: planLimits
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    }
}
