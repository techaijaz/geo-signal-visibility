import mongoose from 'mongoose'

const leadSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },
        brandName: {
            type: String,
            required: true,
            trim: true
        },
        website: {
            type: String,
            required: true,
            trim: true
        },
        score: {
            type: Number,
            default: 0
        },
        resultJson: {
            type: String,
            default: ''
        },
        ip: {
            type: String,
            default: ''
        },
        userAgent: {
            type: String,
            default: ''
        },
        convertedToUser: {
            type: Boolean,
            default: false
        },
        convertedUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        }
    },
    {
        timestamps: true
    }
)

leadSchema.index({ email: 1, createdAt: -1 })
leadSchema.index({ ip: 1, createdAt: -1 })

export default mongoose.model('Lead', leadSchema)
