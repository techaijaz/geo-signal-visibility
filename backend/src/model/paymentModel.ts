import mongoose from 'mongoose'

// One record per gateway payment; the unique paymentId is the claim that makes activation happen once
const paymentSchema = new mongoose.Schema(
    {
        paymentId: { type: String, required: true, unique: true },
        orderId: { type: String, required: true },
        orgId: { type: String, required: true },
        userId: { type: String, required: true },
        plan: { type: String, required: true },
        billingCycle: { type: String, required: true },
        amount: { type: Number, required: true },
        gateway: { type: String, required: true },
        status: { type: String, enum: ['processing', 'done'], default: 'processing' },
        source: { type: String, enum: ['browser', 'webhook'], required: true },
        invoiceId: { type: mongoose.Schema.Types.ObjectId, default: null },
        claimedAt: { type: Date, default: Date.now },
        doneAt: { type: Date, default: null }
    },
    { timestamps: true }
)
paymentSchema.index({ orderId: 1 })

export default mongoose.model('Payment', paymentSchema)
