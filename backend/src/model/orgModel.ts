import mongoose from 'mongoose'
import { IOrg } from '../types/orgTypes'

const orgSchema = new mongoose.Schema<IOrg>(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        whiteLabelEnabled: {
            type: Boolean,
            default: false
        },
        plan: {
            type: String,
            enum: ['free', 'starter', 'growth', 'agency'],
            default: 'starter'
        }
    },
    {
        timestamps: true
    }
)

export default mongoose.model<IOrg>('Org', orgSchema)
