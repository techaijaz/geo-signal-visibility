import mongoose, { Schema, Document } from 'mongoose'

export interface IApiKey extends Document {
    provider: string // 'OpenAI' | 'DeepSeek' | 'Google' | 'Anthropic' | 'Perplexity' | 'OmniRoute'
    encryptedKey: string
    iv: string
    maskedKey: string
    updatedBy?: mongoose.Types.ObjectId
    createdAt: Date
    updatedAt: Date
}

const apiKeySchema = new Schema<IApiKey>(
    {
        provider: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true
        },
        encryptedKey: {
            type: String,
            required: true
        },
        iv: {
            type: String,
            required: true
        },
        maskedKey: {
            type: String,
            required: true
        },
        updatedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        }
    },
    {
        timestamps: true
    }
)

export default mongoose.model<IApiKey>('ApiKey', apiKeySchema)
