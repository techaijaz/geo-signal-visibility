import { Document, Types } from 'mongoose'

export type SubscriptionPlan = 'free' | 'starter' | 'growth' | 'agency'
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing' | 'expired'
export type InvoiceStatus = 'paid' | 'pending' | 'failed' | 'refunded'

export interface ISubscription extends Document {
    _id: Types.ObjectId
    orgId: Types.ObjectId
    userId: Types.ObjectId
    plan: SubscriptionPlan
    status: SubscriptionStatus
    gateway: 'razorpay' | 'stripe' | 'mock'
    gatewayCustomerId?: string
    gatewaySubscriptionId?: string
    billingCycle: 'monthly' | 'yearly'
    currentPeriodStart: Date
    currentPeriodEnd: Date
    cancelAtPeriodEnd: boolean
    // End of the last paid period; null = no paid period (free or granted by an admin), never expires
    expiresAt?: Date | null
    createdAt: Date
    updatedAt: Date
}

export interface IInvoice extends Document {
    _id: Types.ObjectId
    invoiceNumber: string
    orgId: Types.ObjectId
    userId: Types.ObjectId
    plan: SubscriptionPlan
    amount: number
    currency: string
    status: InvoiceStatus
    paymentMethod: string
    gateway: 'razorpay' | 'stripe' | 'mock'
    gatewayPaymentId?: string
    paidAt?: Date
    pdfUrl?: string
    items: Array<{
        description: string
        amount: number
    }>
    createdAt: Date
    updatedAt: Date
}
