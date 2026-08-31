import mongoose from 'mongoose'
import { EBrandRole, EBusinessType, IBrand } from '../types/brandTypes'

const competitorSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        website: {
            type: String,
            trim: true,
            default: ''
        }
    },
    { _id: false }
)

const querySchema = new mongoose.Schema(
    {
        text: {
            type: String,
            required: true,
            trim: true
        },
        intent: {
            type: String,
            default: 'Best-of',
            trim: true
        },
        lang: {
            type: String,
            default: 'EN',
            trim: true
        },
        enabled: {
            type: Boolean,
            default: true
        }
    },
    { _id: false }
)

const brandSchema = new mongoose.Schema<IBrand>(
    {
        orgId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Org',
            required: true,
            index: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        website: {
            type: String,
            required: true,
            trim: true
        },
        category: {
            type: String,
            required: true,
            trim: true
        },
        businessType: {
            type: String,
            enum: Object.values(EBusinessType),
            default: EBusinessType.ECOMMERCE
        },
        region: {
            type: String,
            default: 'India',
            trim: true
        },
        role: {
            type: String,
            enum: Object.values(EBrandRole),
            default: EBrandRole.OWNER
        },
        competitors: {
            type: [competitorSchema],
            default: []
        },
        queries: {
            type: [querySchema],
            default: []
        },
        languages: {
            type: [String],
            default: ['en', 'hi-en']
        }
    },
    {
        timestamps: true
    }
)

brandSchema.index({ orgId: 1, createdAt: -1 })

export default mongoose.model<IBrand>('Brand', brandSchema)
