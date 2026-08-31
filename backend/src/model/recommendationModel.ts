import mongoose from 'mongoose'
import { IRecommendationDocument } from '../types/recommendationTypes'

const recommendationSchema = new mongoose.Schema<IRecommendationDocument>(
    {
        brandId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Brand',
            required: true,
            index: true
        },
        text: {
            type: String,
            required: true,
            trim: true
        },
        category: {
            type: String,
            enum: ['Technical', 'Content', 'Off-site'],
            required: true
        },
        effort: {
            type: String,
            enum: ['Low effort', 'Medium effort', 'High effort'],
            required: true
        },
        impact: {
            type: String,
            enum: ['High impact', 'Medium impact', 'Low impact'],
            required: true
        },
        snippet: {
            type: String,
            default: ''
        },
        reasoning: {
            type: String,
            default: ''
        },
        source: {
            type: String,
            default: 'ai-generated'
        },
        isCompleted: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
)

export default mongoose.model<IRecommendationDocument>('Recommendation', recommendationSchema)
