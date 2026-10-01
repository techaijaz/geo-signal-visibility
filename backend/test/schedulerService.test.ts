import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { query } from './helpers'

const mocks = vi.hoisted(() => ({
    config: { ALLOW_INLINE_JOBS: false },
    enqueueScanJob: vi.fn(),
    enqueueWeeklyReportJob: vi.fn(),
    rescanBrandMentions: vi.fn(),
    expireLapsedSubscriptions: vi.fn()
}))

vi.mock('../src/config/config', () => ({ default: mocks.config }))
vi.mock('../src/service/queueService', () => ({
    enqueueScanJob: mocks.enqueueScanJob,
    enqueueWeeklyReportJob: mocks.enqueueWeeklyReportJob,
    schedulerQueue: { upsertJobScheduler: vi.fn() }
}))
vi.mock('../src/service/databseService', () => ({ default: { rescanBrandMentions: mocks.rescanBrandMentions } }))
vi.mock('../src/service/paymentService', () => ({
    paymentService: { expireLapsedSubscriptions: mocks.expireLapsedSubscriptions }
}))
vi.mock('../src/service/reportService/weeklyReport', () => ({ WEEKLY_REPORT_PLANS: ['starter', 'growth', 'agency'] }))

import brandModel from '../src/model/brandModel'
import orgModel from '../src/model/orgModel'
import mentionModel from '../src/model/mentionModel'
import { runSchedulerTick, runWeeklyReportTick } from '../src/service/schedulerService'

const HOUR = 60 * 60 * 1000
const NOW = new Date('2026-10-01T12:00:00Z')

const id = () => new Types.ObjectId()

describe('runSchedulerTick', () => {
    let updateOne: ReturnType<typeof vi.spyOn>

    // brandModel.find is called twice per tick: first for unscheduled brands, then for due ones
    const brands = (unscheduled: object[], due: object[]) =>
        vi
            .spyOn(brandModel, 'find')
            .mockReturnValueOnce(query(unscheduled) as never)
            .mockReturnValueOnce(query(due) as never)

    beforeEach(() => {
        vi.useFakeTimers({ now: NOW })
        mocks.config.ALLOW_INLINE_JOBS = false
        mocks.enqueueScanJob.mockReset()
        mocks.rescanBrandMentions.mockReset()
        mocks.expireLapsedSubscriptions.mockReset()
        updateOne = vi.spyOn(brandModel, 'updateOne').mockResolvedValue({} as never)
        return () => vi.useRealTimers()
    })

    it('expires lapsed subscriptions before picking brands, so a lapsed org is scanned on its new plan', async () => {
        const order: string[] = []
        mocks.expireLapsedSubscriptions.mockImplementation(async () => order.push('expire'))
        vi.spyOn(brandModel, 'find').mockImplementation(() => {
            order.push('find')
            return query([]) as never
        })

        await runSchedulerTick()

        expect(order[0]).toBe('expire')
    })

    it('leases each due brand for an hour and enqueues a scan', async () => {
        const a = id()
        const b = id()
        const find = brands([], [{ _id: a }, { _id: b }])
        mocks.enqueueScanJob.mockResolvedValue({ id: 'job' })

        const result = await runSchedulerTick()

        expect(result).toEqual({ enqueued: 2 })
        expect((find.mock.calls[1] as unknown[])[0]).toEqual({ nextScanAt: { $lte: NOW } })
        expect(mocks.enqueueScanJob).toHaveBeenCalledWith(a.toString())
        expect(mocks.enqueueScanJob).toHaveBeenCalledWith(b.toString())
        expect(updateOne).toHaveBeenCalledWith({ _id: a }, { $set: { nextScanAt: new Date(NOW.getTime() + HOUR) } })
    })

    it('sets the lease before enqueueing, so an overlapping tick cannot pick the brand again', async () => {
        const brandId = id()
        brands([], [{ _id: brandId }])
        mocks.enqueueScanJob.mockImplementation(async () => {
            expect(updateOne).toHaveBeenCalledTimes(1)
            return { id: 'job' }
        })

        await runSchedulerTick()

        expect(mocks.enqueueScanJob).toHaveBeenCalledTimes(1)
    })

    it('skips the brand until its lease expires when the queue is down', async () => {
        brands([], [{ _id: id() }])
        mocks.enqueueScanJob.mockResolvedValue(null)

        const result = await runSchedulerTick()

        expect(result).toEqual({ enqueued: 0 })
        expect(mocks.rescanBrandMentions).not.toHaveBeenCalled()
        expect(updateOne).toHaveBeenCalledTimes(1)
    })

    it('runs the scan inline when the queue is down and inline jobs are allowed', async () => {
        const brandId = id()
        brands([], [{ _id: brandId }])
        mocks.enqueueScanJob.mockResolvedValue(null)
        mocks.config.ALLOW_INLINE_JOBS = true

        await runSchedulerTick()

        expect(mocks.rescanBrandMentions).toHaveBeenCalledWith(brandId.toString())
    })

    describe('backfill of brands created before nextScanAt existed', () => {
        it('schedules from the latest mention using the org plan interval', async () => {
            const orgId = id()
            const brandId = id()
            const lastScan = new Date('2026-09-30T12:00:00Z')
            brands([{ _id: brandId, orgId }], [])
            vi.spyOn(orgModel, 'find').mockReturnValue(query([{ _id: orgId, plan: 'growth' }]) as never)
            vi.spyOn(mentionModel, 'findOne').mockReturnValue(query({ extractedAt: lastScan }) as never)

            await runSchedulerTick()

            expect(updateOne).toHaveBeenCalledWith(
                { _id: brandId },
                { $set: { lastScannedAt: lastScan, nextScanAt: new Date(lastScan.getTime() + 8 * HOUR) } }
            )
        })

        it('makes a never-scanned brand due immediately', async () => {
            const orgId = id()
            const brandId = id()
            brands([{ _id: brandId, orgId }], [])
            vi.spyOn(orgModel, 'find').mockReturnValue(query([{ _id: orgId, plan: 'starter' }]) as never)
            vi.spyOn(mentionModel, 'findOne').mockReturnValue(query(null) as never)

            await runSchedulerTick()

            expect(updateOne).toHaveBeenCalledWith({ _id: brandId }, { $set: { lastScannedAt: null, nextScanAt: NOW } })
        })
    })
})

describe('runWeeklyReportTick', () => {
    beforeEach(() => {
        vi.useFakeTimers({ now: new Date('2026-09-28T03:30:00Z') }) // Monday 9:00 IST
        mocks.enqueueWeeklyReportJob.mockReset()
        return () => vi.useRealTimers()
    })

    it('queues one report per brand on a paid plan, keyed by ISO week', async () => {
        const orgFind = vi.spyOn(orgModel, 'find').mockReturnValue(query([{ _id: id() }]) as never)
        vi.spyOn(brandModel, 'find').mockReturnValue(query([{ _id: id() }, { _id: id() }]) as never)
        // A job already queued this week (dedupe) comes back null
        mocks.enqueueWeeklyReportJob.mockResolvedValueOnce({ id: 'j1' }).mockResolvedValueOnce(null)

        const result = await runWeeklyReportTick()

        expect(orgFind).toHaveBeenCalledWith({ plan: { $in: ['starter', 'growth', 'agency'] } })
        expect(mocks.enqueueWeeklyReportJob).toHaveBeenCalledWith(expect.any(String), '2026-W40')
        expect(result).toEqual({ queued: 1 })
    })
})
