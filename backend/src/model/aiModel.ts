import mongoose, { Schema, Document } from 'mongoose'

export interface IAiModel extends Document {
    name: string
    modelId: string
    provider: 'OpenAI' | 'DeepSeek' | 'Google' | 'Anthropic' | 'Perplexity' | 'OmniRoute' | 'Other'
    description?: string
    isActive: boolean
    isDefault: boolean
    inputCostPer1k: number
    outputCostPer1k: number
    maxTokens: number
    createdAt: Date
    updatedAt: Date
}

const aiModelSchema = new Schema<IAiModel>(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        modelId: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },
        provider: {
            type: String,
            required: true,
            enum: ['OpenAI', 'DeepSeek', 'Google', 'Anthropic', 'Perplexity', 'OmniRoute', 'Other'],
            default: 'Other'
        },
        description: {
            type: String,
            trim: true
        },
        isActive: {
            type: Boolean,
            default: true
        },
        isDefault: {
            type: Boolean,
            default: false
        },
        inputCostPer1k: {
            type: Number,
            default: 0.0015
        },
        outputCostPer1k: {
            type: Number,
            default: 0.002
        },
        maxTokens: {
            type: Number,
            default: 4000
        }
    },
    {
        timestamps: true
    }
)

export default mongoose.model<IAiModel>('AiModel', aiModelSchema)
