import { Request, Response, NextFunction } from 'express'
import { IAuthenticatedRequest } from '../middleware/authentication'
import databseService from '../service/databseService'
import { paymentService } from '../service/paymentService'
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
            plan: 'starter'
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
            '1 brand workspace',
            '3 tracked queries',
            '1 run per query',
            'Monthly scan',
            'Claude + GPT only',
            'No recommendations'
        ],
        buttonText: 'Downgrade'
    },
    {
        id: 'starter',
        name: 'Starter',
        price: '₹1,499',
        billingPeriod: ' /mo',
        description: 'For solo founders and small D2C teams.',
        features: [
            '1 brand workspace',
            '15 tracked queries',
            '3 runs per query',
            'Weekly scan',
            'Claude + GPT + Gemini',
            'Recommendations included',
            'Weekly email report'
        ],
        buttonText: 'Current plan'
    },
    {
        id: 'growth',
        name: 'Growth',
        price: '₹5,999',
        billingPeriod: ' /mo',
        description: 'For funded startups and growing D2C brands.',
        features: [
            '1 brand workspace',
            '50 tracked queries',
            '3 runs per query',
            'Daily scan option',
            'All models + Perplexity',
            'Competitor share-of-voice',
            'WhatsApp digest'
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
            'Multi-brand workspace (Unlimited)',
            'White-label reports',
            'Daily scans',
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
                currentPlan: org.plan || 'starter',
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

            const org = await ensureUserOrg(authenticatedUser._id.toString(), authenticatedUser.name)
            const updatedOrg = await databseService.updateOrgPlan(org._id.toString(), plan)

            await SubscriptionModel.findOneAndUpdate(
                { orgId: org._id },
                {
                    userId: authenticatedUser._id,
                    plan,
                    status: 'active'
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
            const { plan, billingCycle = 'monthly', gateway = 'mock' } = req.body

            if (!['free', 'starter', 'growth', 'agency'].includes(plan)) {
                return httpError(next, new Error('Invalid plan'), req, 422)
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
            httpError(next, error, req, 500)
        }
    },

    confirmPayment: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const {
                plan,
                billingCycle = 'monthly',
                gateway = 'mock',
                // Razorpay fields
                razorpay_order_id,
                razorpay_payment_id,
                razorpay_signature,
                // Stripe fields
                paymentIntentId,
                // Mock / amount
                amount
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
                gatewaySignature: razorpay_signature,
                amount: Number(amount) || 1499
            })

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                message: 'Payment confirmed & subscription activated!',
                subscription: result.subscription,
                invoice: result.invoice,
                currentPlan: plan
            })
        } catch (error) {
            httpError(next, error, req, 500)
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

            const effectivePlan = authenticatedUser.role === EUserRole.ADMIN ? 'agency' : (org.plan || 'starter')
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
