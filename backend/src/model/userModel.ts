import mongoose from 'mongoose'
import { IUser } from '../types/userTypes'
import { EUserRole } from '../constent/userConstent'

const userSchema = new mongoose.Schema<IUser>(
    {
        orgId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Org',
            default: null
        },
        name: {
            type: String,
            minlength: 3,
            maxlength: 72,
            required: true
        },
        email: {
            type: String,
            required: true,
            unique: true
        },
        phone: {
            _id: false,
            isoCode: {
                type: String,
                required: true
            },
            countryCode: {
                type: String,
                required: true
            },
            internationalNumber: {
                type: String,
                required: true
            }
        },
        timezone: {
            type: String,
            required: true
        },
        password: {
            type: String,
            required: true,
            select: false
        },
        role: {
            type: String,
            required: true,
            default: EUserRole.USER,
            enum: EUserRole
        },
        consent: {
            type: Boolean,
            required: true,
            default: false
        },
        accountConfirmation: {
            _id: false,
            status: {
                type: Boolean,
                required: true,
                default: false
            },
            token: {
                type: String,
                required: true
            },
            code: {
                type: String,
                required: true
            },
            timestamp: {
                type: Date,
                default: null
            }
        },
        passwordReset: {
            _id: false,
            token: {
                type: String,
                default: null
            },
            expiry: {
                type: Number,
                default: null
            },
            lastResetAt: {
                type: Date,
                default: null
            }
        },
        refreshToken: {
            _id: false,
            token: {
                type: String,
                default: null
            }
        },
        lastLoginAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
)

export default mongoose.model<IUser>('User', userSchema)
