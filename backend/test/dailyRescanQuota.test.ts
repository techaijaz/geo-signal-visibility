import { beforeEach, describe, expect, it, vi } from 'vitest'

// databseService pulls in the AI, audit and queue services; none of them are exercised here
vi.mock('../src/service/aiService', () => ({ default: {} }))
vi.mock('../src/service/auditService', () => ({ auditService: {} }))
vi.mock('../src/service/recommendationService', () => ({ generateRecommendations: vi.fn() }))
vi.mock('../src/service/queueService', () => ({}))

import brandModel from '../src/model/brandModel'
import databseService from '../src/service/databseService'

const BRAND = '64b000000000000000000001'
const updated = (n: number) => ({ modifiedCount: n }) as never

describe('consumeDailyRescan', () => {
    let updateOne: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        // 2026-10-01 20:00 UTC is already 2026-10-02 in IST
        vi.useFakeTimers({ now: new Date('2026-10-01T20:00:00Z') })
        updateOne = vi.spyOn(brandModel, 'updateOne')
        return () => vi.useRealTimers()
    })

    it('refuses without touching the brand when the plan allows none', async () => {
        expect(await databseService.consumeDailyRescan(BRAND, 'scan', 0)).toBe(false)
        expect(updateOne).not.toHaveBeenCalled()
    })

    it('counts against today only while under the limit (atomic check-and-increment)', async () => {
        updateOne.mockResolvedValueOnce(updated(1))

        expect(await databseService.consumeDailyRescan(BRAND, 'scan', 3)).toBe(true)
        expect(updateOne).toHaveBeenCalledWith(
            { _id: BRAND, manualRescanDay: '2026-10-02', manualRescanCount: { $lt: 3 } },
            { $inc: { manualRescanCount: 1 } }
        )
    })

    it('starts a fresh count on a new IST day', async () => {
        updateOne.mockResolvedValueOnce(updated(0)).mockResolvedValueOnce(updated(1))

        expect(await databseService.consumeDailyRescan(BRAND, 'audit', 2)).toBe(true)
        expect(updateOne).toHaveBeenLastCalledWith(
            { _id: BRAND, auditRescanDay: { $ne: '2026-10-02' } },
            { $set: { auditRescanDay: '2026-10-02', auditRescanCount: 1 } }
        )
    })

    it('refuses once today is used up', async () => {
        // Same day at the limit, and the new-day branch does not match either
        updateOne.mockResolvedValueOnce(updated(0)).mockResolvedValueOnce(updated(0))

        expect(await databseService.consumeDailyRescan(BRAND, 'recommendation', 1)).toBe(false)
    })

    it('refunds by decrementing, never below zero', async () => {
        updateOne.mockResolvedValueOnce(updated(1))

        await databseService.refundDailyRescan(BRAND, 'scan')

        expect(updateOne).toHaveBeenCalledWith({ _id: BRAND, manualRescanCount: { $gt: 0 } }, { $inc: { manualRescanCount: -1 } })
    })
})
