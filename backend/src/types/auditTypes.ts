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
    checks?: unknown
    lastAuditedAt?: Date
    aiView?: unknown
    storeAudit?: unknown
    feedHealth?: unknown
}

export interface IAuditDocument extends IAuditData, Document {}
