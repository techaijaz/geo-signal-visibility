import mongoose from 'mongoose'
import lockModel from '../../model/lockModel'
import generatedFixModel from '../../model/generatedFixModel'
import { PLAN_LIMITS, type PlanName } from '../../config/planLimits'
import { countFixUsage, nextResetLabel } from './usage'
import type { FixLanguage, FixType } from '../../types/fixTypes'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// One create at a time per org, so two tabs can't both take the last generation
const withFixLock = async <T>(orgId: string, fn: () => Promise<T>): Promise<T | null> => {
    const _id = `fix:${orgId}`
    const deadline = Date.now() + 5000
    for (;;) {
        try {
            await lockModel.create({ _id, at: new Date() })
            break
        } catch (err) {
            if ((err as { code?: number }).code !== 11000) throw err
            // A holder that died leaves a lock older than a minute: clear it
            await lockModel.deleteOne({ _id, at: { $lt: new Date(Date.now() - 60_000) } })
            if (Date.now() > deadline) return null
            await sleep(50)
        }
    }
    try {
        return await fn()
    } finally {
        await lockModel.deleteOne({ _id }).catch(() => undefined)
    }
}

export const createFix = async (
    input: {
        orgId: string
        brandId: string
        userId: string
        plan: PlanName
        type: FixType
        kind?: string | null
        competitor?: string | null
        language: FixLanguage
    },
    enqueue: (fixId: string) => Promise<unknown>,
    now = new Date()
): Promise<{ ok: true; fixId: string } | { ok: false; status: 403 | 409; message: string }> => {
    const limit = PLAN_LIMITS[input.plan].maxFixGenerations
    const created = await withFixLock(input.orgId, async () => {
        if ((await countFixUsage(input.orgId, now)) >= limit) return null
        return generatedFixModel.create({
            orgId: new mongoose.Types.ObjectId(input.orgId),
            brandId: new mongoose.Types.ObjectId(input.brandId),
            userId: new mongoose.Types.ObjectId(input.userId),
            type: input.type,
            kind: input.type === 'faq' ? input.kind || null : null,
            competitor: input.type === 'comparison' ? input.competitor || null : null,
            language: input.language,
            status: 'pending',
            createdAt: now
        })
    })
    if (!created) return { ok: false, status: 403, message: `You've used all ${limit} generations this month. They reset on ${nextResetLabel(now)}.` }
    const fixId = String(created._id)
    if (!(await enqueue(fixId))) {
        await generatedFixModel.updateOne(
            { _id: fixId },
            { status: 'failed', error: 'Busy right now, try again in a minute', finishedAt: new Date() }
        )
        return { ok: false, status: 409, message: 'Busy right now, try again in a minute' }
    }
    return { ok: true, fixId }
}
