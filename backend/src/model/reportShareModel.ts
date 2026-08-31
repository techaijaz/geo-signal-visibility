import mongoose from 'mongoose'
import { IReportShare } from '../types/reportTypes'

const reportShareSchema = new mongoose.Schema<IReportShare>(
    {
        brandId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Brand',
            required: true,
            unique: true,
            index: true
        },
        sharedEmails: {
            type: [String],
            default: []
        }
    },
    {
        timestamps: true
    }
)

export default mongoose.model<IReportShare>('ReportShare', reportShareSchema)
