import mongoose from 'mongoose'

// Razorpay orders opened from Billing; reused for 15 min so two tabs or a double click give one order
const checkoutOrderSchema = new mongoose.Schema({
    orgId: { type: String, required: true },
    plan: { type: String, required: true },
    billingCycle: { type: String, required: true },
    amount: { type: Number, required: true },
    orderId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 24 * 60 * 60 }
})
checkoutOrderSchema.index({ orgId: 1, plan: 1, billingCycle: 1, createdAt: -1 })

export default mongoose.model('CheckoutOrder', checkoutOrderSchema)
