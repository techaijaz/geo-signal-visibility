import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { Types } from 'mongoose'

const mocks = vi.hoisted(() => ({
    config: { ALLOW_INLINE_JOBS: false },
    db: {
        findOrgByOwnerId: vi.fn(),
        findBrandByIdAndOrgId: vi.fn(),
        findBrandsByOrgId: vi.fn(),
        findMentionsByBrandId: vi.fn(),
        consumeDailyRescan: vi.fn(),
        refundDailyRescan: vi.fn(),
        rescanBrandMentions: vi.fn(),
        createBrand: vi.fn()
    },
    enqueueScanJob: vi.fn()
}))

vi.mock('../src/config/config', () => ({ default: mocks.config }))
vi.mock('../src/service/databseService', () => ({ default: mocks.db }))
vi.mock('../src/service/queueService', () => ({ enqueueScanJob: mocks.enqueueScanJob }))
vi.mock('../src/service/competitorService', () => ({ computeCompetitorStats: vi.fn(), loadScanPair: vi.fn() }))

import mentionController from '../src/controller/mentionController'
import brandController from '../src/controller/brandController'
import { EUserRole } from '../src/constent/userConstent'

const userId = new Types.ObjectId()
const orgId = new Types.ObjectId()
const brandId = new Types.ObjectId().toString()

const call = async (
    handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
    { role = EUserRole.USER, params = {}, body = {} }: { role?: string; params?: object; body?: object } = {}
) => {
    const req = { authenticatedUser: { _id: userId, name: 'Asha', role }, params, body, method: 'POST', originalUrl: '/test' }
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }
    const next = vi.fn()
    await handler(req as unknown as Request, res as unknown as Response, next)
    const error = next.mock.calls[0]?.[0] as { statusCode: number; message: string } | undefined
    return { status: error?.statusCode ?? res.status.mock.calls[0]?.[0], message: error?.message, res }
}

beforeEach(() => {
    Object.values(mocks.db).forEach((fn) => fn.mockReset())
    mocks.enqueueScanJob.mockReset()
    mocks.config.ALLOW_INLINE_JOBS = false
})

describe('manual AI re-scan quota', () => {
    const withOrg = (plan: string) => {
        mocks.db.findOrgByOwnerId.mockResolvedValue({ _id: orgId, plan })
        mocks.db.findBrandByIdAndOrgId.mockResolvedValue({ _id: brandId, name: 'Acme' })
    }

    it('checks the daily limit for the org plan', async () => {
        withOrg('growth')
        mocks.db.consumeDailyRescan.mockResolvedValue(true)
        mocks.enqueueScanJob.mockResolvedValue({ id: 'job-1' })

        const { status } = await call(mentionController.rescanMentions, { params: { id: brandId } })

        expect(status).toBe(202)
        expect(mocks.db.consumeDailyRescan).toHaveBeenCalledWith(brandId, 'scan', 3)
    })

    it('returns 429 with an upgrade message once the quota is used', async () => {
        withOrg('starter')
        mocks.db.consumeDailyRescan.mockResolvedValue(false)

        const { status, message } = await call(mentionController.rescanMentions, { params: { id: brandId } })

        expect(status).toBe(429)
        expect(message).toContain('Daily AI re-scan limit reached (1/1')
        expect(mocks.enqueueScanJob).not.toHaveBeenCalled()
    })

    it('gives the re-scan back and returns 503 when the queue is down', async () => {
        withOrg('growth')
        mocks.db.consumeDailyRescan.mockResolvedValue(true)
        mocks.enqueueScanJob.mockResolvedValue(null)

        const { status } = await call(mentionController.rescanMentions, { params: { id: brandId } })

        expect(status).toBe(503)
        expect(mocks.db.refundDailyRescan).toHaveBeenCalledWith(brandId, 'scan')
        expect(mocks.db.rescanBrandMentions).not.toHaveBeenCalled()
    })

    it('treats admins as agency', async () => {
        withOrg('free')
        mocks.db.consumeDailyRescan.mockResolvedValue(true)
        mocks.enqueueScanJob.mockResolvedValue({ id: 'job-1' })

        await call(mentionController.rescanMentions, { role: EUserRole.ADMIN, params: { id: brandId } })

        expect(mocks.db.consumeDailyRescan).toHaveBeenCalledWith(brandId, 'scan', 10)
    })
})

describe('brand creation quota', () => {
    const brand = (overrides: object = {}) => ({
        name: 'Acme',
        website: 'https://acme.in',
        category: 'Skincare',
        ...overrides
    })
    const queries = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `best skincare brand ${i}`, enabled: true }))

    beforeEach(() => {
        mocks.db.findBrandsByOrgId.mockResolvedValue([])
    })

    it('blocks a second brand on the free plan', async () => {
        mocks.db.findOrgByOwnerId.mockResolvedValue({ _id: orgId, plan: 'free' })
        mocks.db.findBrandsByOrgId.mockResolvedValue([{ _id: new Types.ObjectId() }])

        const { status, message } = await call(brandController.createBrand, { body: brand() })

        expect(status).toBe(403)
        expect(message).toBe('Your free plan allows up to 1 brand. Please upgrade your plan to add more brands.')
        expect(mocks.db.createBrand).not.toHaveBeenCalled()
    })

    it('blocks more queries than the plan allows', async () => {
        mocks.db.findOrgByOwnerId.mockResolvedValue({ _id: orgId, plan: 'free' })

        const { status, message } = await call(brandController.createBrand, { body: brand({ queries: queries(4) }) })

        expect(status).toBe(403)
        expect(message).toContain('maximum 3 queries')
    })

    it('does not count disabled queries against the limit', async () => {
        mocks.db.findOrgByOwnerId.mockResolvedValue({ _id: orgId, plan: 'free' })
        const body = brand({ queries: [...queries(3), { text: 'paused query', enabled: false }] })

        mocks.db.createBrand.mockResolvedValue({ _id: brandId })

        const { status } = await call(brandController.createBrand, { body })

        expect(status).toBe(201)
        expect(mocks.db.createBrand).toHaveBeenCalledWith(expect.objectContaining({ orgId: orgId.toString() }))
    })

    it('blocks more competitors than the plan allows', async () => {
        mocks.db.findOrgByOwnerId.mockResolvedValue({ _id: orgId, plan: 'starter' })
        const competitors = Array.from({ length: 6 }, (_, i) => ({ name: `Rival ${i}` }))

        const { status, message } = await call(brandController.createBrand, { body: brand({ competitors }) })

        expect(status).toBe(403)
        expect(message).toContain('maximum 5 competitors')
    })
})
