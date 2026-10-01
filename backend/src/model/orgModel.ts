import mongoose from 'mongoose'
import { IOrg } from '../types/orgTypes'
import brandModel from './brandModel'
import { SCAN_INTERVAL_HOURS, PlanName } from '../config/planLimits'

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
            default: 'free'
        }
    },
    {
        timestamps: true
    }
)

// When a plan changes, re-base each brand's next scan on the new plan's interval
orgSchema.post('findOneAndUpdate', async function (doc: (IOrg & { _id: mongoose.Types.ObjectId }) | null) {
    const update = this.getUpdate() as { plan?: string; $set?: { plan?: string } } | null
    const plan = update?.plan ?? update?.$set?.plan
    if (!doc || !plan) return

    const intervalMs = (SCAN_INTERVAL_HOURS[plan as PlanName] ?? SCAN_INTERVAL_HOURS.free) * 60 * 60 * 1000
    await brandModel.updateMany({ orgId: doc._id, lastScannedAt: { $ne: null } }, [
        { $set: { nextScanAt: { $add: ['$lastScannedAt', intervalMs] } } }
    ])
})

export default mongoose.model<IOrg>('Org', orgSchema)
