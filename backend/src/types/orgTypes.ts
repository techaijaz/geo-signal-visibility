import { Types } from 'mongoose'

export interface ICreateOrgRequestBody {
    name: string
    whiteLabelEnabled?: boolean
}

export interface IOrg {
    name: string
    ownerId: Types.ObjectId | string
    whiteLabelEnabled: boolean
    plan?: 'free' | 'starter' | 'growth' | 'agency'
    createdAt?: Date
    updatedAt?: Date
}

export interface IOrgWithId extends IOrg {
    _id: string
}
