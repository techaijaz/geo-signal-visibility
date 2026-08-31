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
    languages?: string[]
}

export interface IBrand {
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
    languages: string[]
    createdAt?: Date
    updatedAt?: Date
}

export interface IBrandWithId extends IBrand {
    _id: string
}
