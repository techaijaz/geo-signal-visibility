import mongoose from 'mongoose'
import { IMention } from '../types/mentionTypes'

const mentionSchema = new mongoose.Schema<IMention>(
    {
        brandId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Brand',
            required: true,
            index: true
        },
        queryText: {
            type: String,
            required: true,
            trim: true
        },
        model: {
            type: String,
            required: true,
            trim: true
        },
        mentioned: {
            type: Boolean,
            required: true,
            default: false
        },
        position: {
            type: Number,
            default: null
        },
        sentiment: {
            type: String,
            enum: ['Positive', 'Neutral', 'Negative'],
            default: 'Neutral'
        },
        rawText: {
            type: String,
            default: ''
        },
        extractedAt: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
)

mentionSchema.index({ brandId: 1, extractedAt: -1 })
mentionSchema.index({ brandId: 1, model: 1 })

export default mongoose.model<IMention>('Mention', mentionSchema)
