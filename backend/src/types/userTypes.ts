import { JwtPayload } from 'jsonwebtoken'
import { Types } from 'mongoose'
import { EUserRole } from '../constent/userConstent'

export interface IRegisterRequestBody {
    name: string
    email: string
    phone: string
    password: string
    consent: boolean
}

export interface IForgotPasswordRequestBody {
    email: string
}

export interface IResetPasswordRequestBody {
    newPassword: string
}
export interface IChangePasswordRequestBody {
    oldPassword: string
    newPassword: string
}

export interface IUpdateProfileRequestBody {
    name?: string
    phone?: string
}

export interface ILoginRequestBody {
    email: string
    password: string
}

export interface IUser {
    orgId?: Types.ObjectId | string
    name: string
    email: string
    phone: {
        isoCode: string
        countryCode: string
        internationalNumber: string
    }
    timezone: string
    password: string
    consent: boolean
    role: EUserRole
    accountConfirmation: {
        status: boolean
        token: string
        code: string
        timestamp: Date | null
    }
    passwordReset: {
        token: string
        expiry: number | null
        lastResetAt: Date | null
    }
    refreshToken: {
        token: string | null
    }
    lastLoginAt: Date | null
}

export interface IUserWithId extends IUser {
    _id: string
}

export interface IDecriptedJwt extends JwtPayload {
    userId: string
}
