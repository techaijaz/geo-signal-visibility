/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/generatedFix.check.ts (needs the local Mongo)
import assert from 'assert'
import mongoose from 'mongoose'
import { PLAN_LIMITS } from '../config/planLimits'
import generatedFixModel from '../model/generatedFixModel'
import { istMonthStart, nextResetLabel, countFixUsage } from '../service/fix/usage'

const run = async () => {
    await mongoose.connect('mongodb://127.0.0.1:27017/signal_fix_check')
    await mongoose.connection.dropDatabase()

    // Limits
    assert.deepEqual(
        [
            PLAN_LIMITS.free.maxFixGenerations,
            PLAN_LIMITS.starter.maxFixGenerations,
            PLAN_LIMITS.growth.maxFixGenerations,
            PLAN_LIMITS.agency.maxFixGenerations
        ],
        [1, 10, 30, 150]
    )

    // IST month: 31 Oct 23:59 IST is October, 1 Nov 00:00 IST is November
    assert.equal(istMonthStart(new Date('2026-10-31T18:29:00Z')).toISOString(), '2026-09-30T18:30:00.000Z')
    assert.equal(istMonthStart(new Date('2026-10-31T18:30:00Z')).toISOString(), '2026-10-31T18:30:00.000Z')
    assert.equal(nextResetLabel(new Date('2026-10-12T10:00:00Z')), '1 Nov')
    assert.equal(nextResetLabel(new Date('2026-12-20T10:00:00Z')), '1 Jan')

    // Usage: done counts, failed doesn't, fresh pending counts, stale pending doesn't, last month doesn't
    const orgId = new mongoose.Types.ObjectId()
    const now = new Date('2026-10-12T10:00:00Z')
    const base = { orgId, brandId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), type: 'faq', language: 'en' }
    await generatedFixModel.create([
        { ...base, status: 'done', createdAt: new Date('2026-10-02T00:00:00Z') },
        { ...base, status: 'failed', createdAt: new Date('2026-10-03T00:00:00Z') },
        { ...base, status: 'pending', createdAt: new Date(now.getTime() - 60_000) },
        { ...base, status: 'pending', createdAt: new Date(now.getTime() - 10 * 60_000) },
        { ...base, status: 'done', createdAt: new Date('2026-09-30T18:29:00Z') } // 23:59 IST 30 Sep
    ])
    assert.equal(await countFixUsage(String(orgId), now), 2)

    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
    console.log('generated fix checks passed')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
