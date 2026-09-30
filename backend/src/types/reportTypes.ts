import { Types } from 'mongoose'
import type { IReportData } from '../service/reportService/reportData'

export interface IReport {
    _id?: Types.ObjectId | string
    brandId: Types.ObjectId | string
    date: string
    title?: string
    meta: string
    score: number
    queriesCount: number
    modelsCount: number
    type: 'auto-generated' | 'manual run' | 'weekly'
    // Snapshot the PDF is rendered from; missing on reports created before snapshots existed
    data?: IReportData | null
    emailedAt?: Date | null
    createdAt?: Date
    updatedAt?: Date
}

export interface IReportShare {
    _id?: Types.ObjectId | string
    brandId: Types.ObjectId | string
    sharedEmails: string[]
    // Recipients (owner or shared) who used the unsubscribe link in a weekly email
    unsubscribed: string[]
    createdAt?: Date
    updatedAt?: Date
}
