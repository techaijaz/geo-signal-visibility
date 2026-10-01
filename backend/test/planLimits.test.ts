import { describe, expect, it } from 'vitest'
import { DAILY_RESCAN_LIMITS, PLAN_LIMITS, SCAN_INTERVAL_HOURS, getNextScanAt, rescanLimitMessage, type PlanName } from '../src/config/planLimits'

const HOUR = 60 * 60 * 1000
const PAID_TIERS: PlanName[] = ['free', 'starter', 'growth', 'agency']

describe('getNextScanAt', () => {
    const from = new Date('2026-10-01T00:00:00Z')

    it.each([
        ['free', 168],
        ['starter', 24],
        ['growth', 8],
        ['agency', 12]
    ])('schedules %s brands %i hours out', (plan, hours) => {
        expect(getNextScanAt(plan, from).getTime() - from.getTime()).toBe(hours * HOUR)
    })

    it('treats a missing plan as free', () => {
        expect(getNextScanAt(undefined, from).getTime() - from.getTime()).toBe(SCAN_INTERVAL_HOURS.free * HOUR)
    })

    it('treats an unknown plan as free rather than scanning constantly', () => {
        expect(getNextScanAt('enterprise', from).getTime() - from.getTime()).toBe(SCAN_INTERVAL_HOURS.free * HOUR)
    })
})

describe('plan quotas', () => {
    it('never shrinks a quota when moving up a tier', () => {
        for (let i = 1; i < PAID_TIERS.length; i++) {
            const lower = PLAN_LIMITS[PAID_TIERS[i - 1]]
            const higher = PLAN_LIMITS[PAID_TIERS[i]]
            expect(higher.maxQueries).toBeGreaterThanOrEqual(lower.maxQueries)
            expect(higher.maxBrands).toBeGreaterThanOrEqual(lower.maxBrands)
            expect(higher.maxCompetitors).toBeGreaterThanOrEqual(lower.maxCompetitors)
            for (const provider of lower.allowedProviders) expect(higher.allowedProviders).toContain(provider)
            for (const lang of lower.allowedLanguages) expect(higher.allowedLanguages).toContain(lang)
            for (const kind of ['scan', 'audit', 'recommendation'] as const) {
                expect(DAILY_RESCAN_LIMITS[PAID_TIERS[i]][kind]).toBeGreaterThanOrEqual(DAILY_RESCAN_LIMITS[PAID_TIERS[i - 1]][kind])
            }
        }
    })

    it('keeps Perplexity, the costliest AI per call, on the agency plan only', () => {
        for (const plan of PAID_TIERS) {
            expect(PLAN_LIMITS[plan].allowedProviders.includes('Perplexity' as never)).toBe(plan === 'agency')
        }
    })

    it('gives the free plan no manual AI re-scans', () => {
        expect(DAILY_RESCAN_LIMITS.free.scan).toBe(0)
    })
})

describe('rescanLimitMessage', () => {
    it('tells free users the feature needs an upgrade', () => {
        expect(rescanLimitMessage('scan', 'free', 0)).toBe('Manual AI re-scan is not available on the free plan. Upgrade to run it on demand.')
    })

    it('tells paid users their daily limit and when it resets', () => {
        expect(rescanLimitMessage('audit', 'growth', 3)).toBe(
            'Daily site audit re-run limit reached (3/3 for this brand on the growth plan). It resets at midnight IST, or upgrade for more.'
        )
    })
})
