import mongoose from 'mongoose'
import type { IFreeCheck } from '../types/freeCheckTypes'

const answerSchema = new mongoose.Schema(
    {
        engine: { type: String, required: true },
        ok: { type: Boolean, default: false },
        named: { type: Boolean, default: false },
        position: { type: Number, default: null },
        brands: { type: [String], default: [] }
    },
    { _id: false }
)

const freeCheckSchema = new mongoose.Schema<IFreeCheck>(
    {
        checkId: { type: String, required: true, unique: true },
        url: { type: String, required: true },
        domain: { type: String, required: true },
        brandName: { type: String, required: true },
        category: { type: String, required: true },
        market: { type: String, default: 'IN' },
        questions: {
            type: [new mongoose.Schema({ text: { type: String, required: true }, answers: { type: [answerSchema], default: [] } }, { _id: false })],
            default: []
        },
        ipHash: { type: String, required: true },
        country: { type: String, default: '' },
        status: { type: String, enum: ['queued', 'running', 'done', 'failed', 'waiting-email', 'scheduled'], default: 'queued' },
        email: { type: String, default: null },
        verifiedAt: { type: Date, default: null },
        otpHash: { type: String, default: null },
        otpExpiresAt: { type: Date, default: null },
        otpAttempts: { type: Number, default: 0 },
        consentRequested: { type: Boolean, default: false }
    },
    { timestamps: true }
)

// Visitors' checks are short-lived; the lead keeps what matters
freeCheckSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 })

export default mongoose.model<IFreeCheck>('FreeCheck', freeCheckSchema)
