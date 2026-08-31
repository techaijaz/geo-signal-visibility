import { Types } from 'mongoose'

export interface IReport {
    _id?: Types.ObjectId | string
    brandId: Types.ObjectId | string
    date: string
    title?: string
    meta: string
    score: number
    queriesCount: number
    modelsCount: number
    type: 'auto-generated' | 'manual run'
    createdAt?: Date
    updatedAt?: Date
}

export interface IReportShare {
    _id?: Types.ObjectId | string
    brandId: Types.ObjectId | string
    sharedEmails: string[]
    createdAt?: Date
    updatedAt?: Date
}
