import { Document, Types } from 'mongoose'
import type { ICitedPage } from '../service/citationService'

// One weekly "where AI reads" check of a brand (feature #9)
export interface ICitationRun {
    brandId: Types.ObjectId | string
    week: string // ISO week, one run per brand per week
    status: 'running' | 'ok' | 'failed'
    startedAt: Date
    finishedAt?: Date | null
    questions: Array<{ text: string; ok: boolean }>
    pages: ICitedPage[]
    createdAt?: Date
}

export interface ICitationRunDocument extends ICitationRun, Document {}
