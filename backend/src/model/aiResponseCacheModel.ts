import mongoose from 'mongoose'

// Shared cache of raw AI answers keyed by provider + model + normalized query.
// Different brands asking the same question reuse one paid answer; parsing stays per brand.
const aiResponseCacheSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true
        },
        provider: {
            type: String,
            required: true
        },
        modelId: {
            type: String,
            default: ''
        },
        queryText: {
            type: String,
            required: true
        },
        response: {
            type: String,
            required: true
        },
        expiresAt: {
            type: Date,
            required: true
        }
    },
    { timestamps: true }
)

// MongoDB removes entries once expiresAt passes
aiResponseCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export default mongoose.model('AiResponseCache', aiResponseCacheSchema)
