import mongoose from 'mongoose'
import { IReport } from '../types/reportTypes'

const reportSchema = new mongoose.Schema<IReport>(
    {
        brandId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Brand',
            required: true,
            index: true
        },
        date: {
            type: String,
            required: true
        },
        title: {
            type: String,
            default: 'Weekly Brand Snapshot'
        },
        meta: {
            type: String,
            required: true
        },
        score: {
            type: Number,
            required: true
        },
        queriesCount: {
            type: Number,
            default: 8
        },
        modelsCount: {
            type: Number,
            default: 3
        },
        type: {
            type: String,
            enum: ['auto-generated', 'manual run'],
            default: 'manual run'
        }
    },
    {
        timestamps: true
    }
)

reportSchema.index({ brandId: 1, createdAt: -1 })

export default mongoose.model<IReport>('Report', reportSchema)
