import { Types } from 'mongoose'

export interface IBrandNamed {
    name: string
    position: number | null
}

export interface IMention {
    brandId: Types.ObjectId | string
    scanId?: string | null
    queryText: string
    model: string
    mentioned: boolean
    position: number | null
    sentiment: 'Positive' | 'Neutral' | 'Negative'
    rawText?: string
    brandsNamed?: IBrandNamed[]
    extractedAt: Date
}

export interface IVisibilityTrendPoint {
    scanId: string
    scannedAt: Date
    score: number
    models: Array<{ name: string; score: number }>
}
