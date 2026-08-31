import mongoose from 'mongoose'

const costLogSchema = new mongoose.Schema(
    {
        brandId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Brand',
            required: true
        },
        provider: {
            type: String,
            required: true
        },
        queryText: {
            type: String,
            default: ''
        },
        tokensUsed: {
            type: Number,
            default: 0
        },
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
