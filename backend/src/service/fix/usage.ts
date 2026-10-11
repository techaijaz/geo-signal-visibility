import mongoose from 'mongoose'
import generatedFixModel from '../../model/generatedFixModel'

const IST_MS = 5.5 * 60 * 60 * 1000
export const STALE_PENDING_MS = 5 * 60 * 1000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Start of the IST calendar month that `now` falls in, as a UTC instant
export const istMonthStart = (now: Date) => {
    const ist = new Date(now.getTime() + IST_MS)
    return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_MS)
}

// "1 Nov": when this month's generations reset
export const nextResetLabel = (now: Date) => {
    const ist = new Date(now.getTime() + IST_MS)
    return `1 ${MONTHS[(ist.getUTCMonth() + 1) % 12]}`
}

// Finished generations this month, plus ones still running (so parallel clicks can't pass the limit).
// Failed ones and pending ones stuck over 5 minutes don't count
export const countFixUsage = (orgId: string, now = new Date()) =>
    generatedFixModel.countDocuments({
        orgId: new mongoose.Types.ObjectId(orgId),
        createdAt: { $gte: istMonthStart(now) },
        $or: [{ status: 'done' }, { status: 'pending', createdAt: { $gte: new Date(now.getTime() - STALE_PENDING_MS) } }]
    })
