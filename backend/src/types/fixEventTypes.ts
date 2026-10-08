import { Document, Types } from 'mongoose'

export type FixSource = 'user' | 'audit'

// One piece of recommended work done by a brand; kept apart from recommendations, which a rescan deletes
export interface IFixEvent {
    _id?: Types.ObjectId | string
    brandId: Types.ObjectId | string
    recommendationId: Types.ObjectId | string
    text: string
    category: string
    source: FixSource
    verified: boolean
    doneAt: Date
    undoneAt?: Date | null
    emailedAt?: Date | null
}

export interface IFixEventDocument extends Omit<IFixEvent, '_id'>, Document {}
