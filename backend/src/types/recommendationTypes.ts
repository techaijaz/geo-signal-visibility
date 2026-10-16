import { Document, Types } from 'mongoose'

export interface IRecommendationData {
    brandId: Types.ObjectId | string
    text: string
    category: 'Technical' | 'Content' | 'Off-site'
    effort: 'Low effort' | 'Medium effort' | 'High effort'
    impact: 'High impact' | 'Medium impact' | 'Low impact'
    reasoning?: string
    fixSnippet?: string
    snippet?: string
    isCompleted: boolean
    source?: string
    kind?: string | null
    createdAt?: Date
    updatedAt?: Date
}

export interface IRecommendationDocument extends IRecommendationData, Document {}
