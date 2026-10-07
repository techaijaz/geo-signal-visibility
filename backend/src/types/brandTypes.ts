import { Types } from 'mongoose'

export enum EBrandRole {
    OWNER = 'owner',
    CLIENT = 'client'
}

export enum EBusinessType {
    ECOMMERCE = 'ecommerce',
    SAAS = 'saas',
    SERVICE = 'service',
    LOCAL_BUSINESS = 'local_business',
    CONTENT_MEDIA = 'content_media'
}

export interface ICompetitor {
    name: string
    website?: string
}

export interface IBrandProduct {
    shopifyId: string | null
    title: string
    shortName: string
    aliases: string[]
    url: string
    price: number | null
    image: string
    productType: string
    nameEditedByUser: boolean
}

export interface IBrandQuery {
    text: string
    intent?: string
    lang?: string
    enabled?: boolean
}

export interface ICreateBrandRequestBody {
    name: string
    website: string
    category: string
    businessType?: EBusinessType
    region?: string
    role?: EBrandRole
    competitors?: ICompetitor[]
    queries?: IBrandQuery[]
    products?: IBrandProduct[]
    languages?: string[]
}

export interface IUpdateBrandRequestBody {
    name?: string
    website?: string
    category?: string
    businessType?: EBusinessType
    region?: string
    role?: EBrandRole
    competitors?: ICompetitor[]
    queries?: IBrandQuery[]
    products?: IBrandProduct[]
    languages?: string[]
}

export interface IBrand {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _id?: any
    orgId: Types.ObjectId | string
    name: string
    website: string
    category: string
    businessType?: EBusinessType
    region: string
    role: EBrandRole
    competitors: ICompetitor[]
    queries: IBrandQuery[]
    products?: IBrandProduct[]
    languages: string[]
    lastScanId?: string | null
    lastScannedAt?: Date | null
    lastScanError?: { message: string; at: Date } | null
    lastScanSilentModels?: string[]
    recommendationsSeedingAt?: Date | null
    nextScanAt?: Date | null
    manualRescanDay?: string | null
    manualRescanCount?: number
    auditRescanDay?: string | null
    auditRescanCount?: number
    recommendationRescanDay?: string | null
    recommendationRescanCount?: number
    createdAt?: Date
    updatedAt?: Date
}

export interface IBrandWithId extends IBrand {
    _id: string
}
