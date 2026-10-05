import mongoose from 'mongoose'

// One row per AI provider call that returned an answer. Cache hits make no call and are not logged.
const costLogSchema = new mongoose.Schema(
    {
        // Empty for calls made outside a brand's scan or recommendations
        brandId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Brand'
        },
        purpose: {
            type: String,
            enum: ['scan', 'recommendations', 'brands']
        },
        provider: {
            type: String,
            required: true
        },
        model: {
            type: String,
            default: ''
        },
        queryText: {
            type: String,
            default: ''
        },
        inputTokens: {
            type: Number,
            default: 0
        },
        outputTokens: {
            type: Number,
            default: 0
        },
        tokensUsed: {
            type: Number,
            default: 0
        },
        // USD, from the model's price per 1k tokens at the time of the call
        cost: {
            type: Number,
            default: 0
        },
        latencyMs: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    }
)

costLogSchema.index({ brandId: 1, createdAt: -1 })
costLogSchema.index({ provider: 1, createdAt: -1 })

export default mongoose.model('CostLog', costLogSchema)
