import { Types } from 'mongoose'

export interface IMention {
    brandId: Types.ObjectId | string
    queryText: string
    model: string
    mentioned: boolean
    position: number | null
    sentiment: 'Positive' | 'Neutral' | 'Negative'
    rawText?: string
    extractedAt: Date
}
