import { SubscriptionPlan } from '../../types/billingTypes'

// Payment verification failures: the client's fault (400), not a server error
export class PaymentError extends Error {}

// ─── Plan pricing (₹) ─────────────────────────────────────────────────────────

export const PLAN_PRICES: Record<SubscriptionPlan, { monthly: number; yearly: number }> = {
    free: { monthly: 0, yearly: 0 },
    starter: { monthly: 2999, yearly: 29990 },
    growth: { monthly: 9999, yearly: 99990 },
    agency: { monthly: 19999, yearly: 199990 }
}
