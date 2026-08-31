import mongoose from 'mongoose'
import { ISubscription, IInvoice } from '../types/billingTypes'

const subscriptionSchema = new mongoose.Schema<ISubscription>(
    {
        orgId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Org',
            required: true,
            index: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        plan: {
            type: String,
            enum: ['free', 'starter', 'growth', 'agency'],
            default: 'starter',
            required: true
        },
        status: {
            type: String,
            enum: ['active', 'past_due', 'canceled', 'trialing'],
            default: 'active',
            required: true
        },
        gateway: {
            type: String,
            enum: ['razorpay', 'stripe', 'mock'],
            default: 'mock'
        },
        gatewayCustomerId: {
            type: String,
            default: null
        },
        gatewaySubscriptionId: {
            type: String,
            default: null
        },
        billingCycle: {
            type: String,
            enum: ['monthly', 'yearly'],
            default: 'monthly'
        },
        currentPeriodStart: {
            type: Date,
            default: Date.now
        },
        currentPeriodEnd: {
            type: Date,
            default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        cancelAtPeriodEnd: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
)

const invoiceSchema = new mongoose.Schema<IInvoice>(
    {
        invoiceNumber: {
            type: String,
            required: true,
            unique: true
        },
        orgId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Org',
            required: true,
            index: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        plan: {
            type: String,
            enum: ['free', 'starter', 'growth', 'agency'],
            required: true
        },
        amount: {
            type: Number,
            required: true
        },
        currency: {
            type: String,
            default: 'INR'
        },
        status: {
            type: String,
            enum: ['paid', 'pending', 'failed', 'refunded'],
            default: 'paid'
        },
        paymentMethod: {
            type: String,
            default: 'UPI / Card (Razorpay)'
        },
        gateway: {
            type: String,
            enum: ['razorpay', 'stripe', 'mock'],
            default: 'mock'
        },
        gatewayPaymentId: {
            type: String,
            default: null
        },
        paidAt: {
            type: Date,
            default: Date.now
        },
        pdfUrl: {
            type: String,
            default: null
        },
        items: [
            {
                description: { type: String, required: true },
                amount: { type: Number, required: true }
            }
        ]
    },
    { timestamps: true }
)

export const SubscriptionModel = mongoose.model<ISubscription>('Subscription', subscriptionSchema)
export const InvoiceModel = mongoose.model<IInvoice>('Invoice', invoiceSchema)
