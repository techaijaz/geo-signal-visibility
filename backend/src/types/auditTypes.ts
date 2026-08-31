import { Document, Types } from 'mongoose'

export interface IAuditGridItem {
    name: string
    status: string
    badgeType: 'badge-ok' | 'badge-bad' | 'badge-warn'
}

export interface IAuditData {
    brandId: Types.ObjectId | string
    healthScore: number
    holdingBack?: string[]
    crawlerAccess?: IAuditGridItem[]
    structuredData?: IAuditGridItem[]
    offSiteFootprint?: IAuditGridItem[]
    marketplaceReadability?: IAuditGridItem[]
    checks?: any
    lastAuditedAt?: Date
}

export interface IAuditDocument extends IAuditData, Document {}
