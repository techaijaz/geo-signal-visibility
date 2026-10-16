import mongoose from 'mongoose'

// "Send to developer" log: shows "Sent to x · 2 days ago" on the task; kept 90 days
const developerSendSchema = new mongoose.Schema({
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    to: { type: String, required: true },
    taskKey: { type: String, required: true },
    kind: { type: String, default: 'other' },
    sentAt: { type: Date, default: Date.now }
})
developerSendSchema.index({ brandId: 1, taskKey: 1, sentAt: -1 })
developerSendSchema.index({ sentAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 })
export default mongoose.model('DeveloperSend', developerSendSchema)
