// Records when recommended work gets done, for fix impact (feature #14).
// Never throws: a failed write must not stop the recommendation toggle or the audit.
import fixEventModel from '../model/fixEventModel'
import type { FixSource } from '../types/fixEventTypes'
import logger from '../util/loger'

interface IRecLike {
    _id: unknown
    brandId: unknown
    text: string
    category?: string
}

// One open event per recommendation; the audit confirming a ticked one only marks it verified (the work happened when the user did it)
export const recordDone = async (rec: IRecLike, source: FixSource, at = new Date()) => {
    try {
        const open = await fixEventModel.findOne({ brandId: rec.brandId, recommendationId: rec._id, undoneAt: null })
        if (open) {
            if (source === 'audit' && !open.verified) await fixEventModel.updateOne({ _id: open._id }, { verified: true })
            return
        }
        await fixEventModel.create({
            brandId: rec.brandId,
            recommendationId: rec._id,
            text: rec.text,
            category: rec.category || '',
            source,
            verified: source === 'audit',
            doneAt: at
        })
    } catch (err) {
        logger.error('[FixEvent] Could not record done work', { meta: err })
    }
}

export const recordUndone = async (brandId: string, recId: string) => {
    try {
        await fixEventModel.updateOne({ brandId, recommendationId: recId, undoneAt: null }, { undoneAt: new Date() })
    } catch (err) {
        logger.error('[FixEvent] Could not record undone work', { meta: err })
    }
}

// The audit confirmed work the user had already ticked: verify its open events, never create new ones
// (a tick from before this feature would otherwise become an audit event dated today)
export const markVerified = async (brandId: string, recIds: unknown[]) => {
    if (!recIds.length) return
    try {
        await fixEventModel.updateMany({ brandId, recommendationId: { $in: recIds }, undoneAt: null, verified: false }, { verified: true })
    } catch (err) {
        logger.error('[FixEvent] Could not mark work verified', { meta: err })
    }
}

export const deleteBrandFixEvents = async (brandId: string) => {
    try {
        await fixEventModel.deleteMany({ brandId })
    } catch (err) {
        logger.error('[FixEvent] Could not delete brand events', { meta: err })
    }
}
