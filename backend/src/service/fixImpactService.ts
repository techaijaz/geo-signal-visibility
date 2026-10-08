// Fix impact: AI visibility before and after the recommended work a brand did (feature #14).
// Always "after", never "because of": visibility also moves with model updates, competitors and scan noise.
import fixEventModel from '../model/fixEventModel'
import databseService from './databseService'
import { SCAN_INTERVAL_HOURS, type PlanName } from '../config/planLimits'
import type { IFixEvent } from '../types/fixEventTypes'

const DAY = 24 * 60 * 60 * 1000
const GROUP_DAYS = 7 // events within 7 days of a group's first event share its result
const BEFORE_DAYS = 14
const AFTER_START_DAYS = 7 // AI has not picked the change up in the first week
const AFTER_END_DAYS = 30
const MIN_AFTER_SCANS = 2
const FLAT_BAND = 3 // points; normal scan-to-scan noise
const OVERVIEW_DAYS = 60
const LOOKBACK_DAYS = 120

export interface IScanPoint {
    scannedAt: Date
    models: Array<{ name: string; score: number }>
}

export type FixState = 'no-before' | 'measuring' | 'interim' | 'final' | 'no-after'

export interface IFixGroup {
    start: Date
    end: Date
    fixes: Array<{ text: string; category: string; verified: boolean; doneAt: Date }>
    eventIds: string[]
    verified: boolean
    emailed: boolean
    state: FixState
    daysLeft?: number
    before?: number
    after?: number
    delta?: number
    result?: 'up' | 'flat' | 'down'
    engines?: Array<{ name: string; before: number; after: number }>
}

const time = (d: Date) => new Date(d).getTime()

// Open (not undone) events, oldest first, grouped from each group's first event (no chaining)
export const groupFixEvents = (events: IFixEvent[]): IFixEvent[][] => {
    const open = events.filter((e) => !e.undoneAt).sort((a, b) => time(a.doneAt) - time(b.doneAt))
    const groups: IFixEvent[][] = []
    for (const e of open) {
        const current = groups[groups.length - 1]
        if (current && time(e.doneAt) - time(current[0].doneAt) <= GROUP_DAYS * DAY) current.push(e)
        else groups.push([e])
    }
    return groups
}

// Average score per engine over the scans in [from, to)
const averages = (scans: IScanPoint[], from: number, to: number) => {
    const inWindow = scans.filter((s) => time(s.scannedAt) >= from && time(s.scannedAt) < to)
    const sums = new Map<string, { total: number; count: number }>()
    for (const s of inWindow) {
        for (const m of s.models) {
            const cur = sums.get(m.name) || { total: 0, count: 0 }
            sums.set(m.name, { total: cur.total + m.score, count: cur.count + 1 })
        }
    }
    const avg = new Map<string, number>()
    sums.forEach((v, k) => avg.set(k, Math.round(v.total / v.count)))
    return { count: inWindow.length, avg }
}

export const measureGroup = (group: IFixEvent[], scans: IScanPoint[], now: Date, scanIntervalHours: number): IFixGroup => {
    const first = time(group[0].doneAt)
    const last = time(group[group.length - 1].doneAt)
    const base: IFixGroup = {
        start: new Date(first),
        end: new Date(last),
        fixes: group.map((e) => ({ text: e.text, category: e.category, verified: !!e.verified, doneAt: new Date(e.doneAt) })),
        eventIds: group.map((e) => String(e._id)),
        verified: group.every((e) => !!e.verified),
        emailed: group.some((e) => !!e.emailedAt),
        state: 'measuring'
    }

    const before = averages(scans, first - BEFORE_DAYS * DAY, first)
    const after = averages(scans, last + AFTER_START_DAYS * DAY, last + AFTER_END_DAYS * DAY)
    const over = time(now) >= last + AFTER_END_DAYS * DAY

    if (before.count === 0) return { ...base, state: 'no-before' }
    if (after.count < MIN_AFTER_SCANS) {
        if (over) return { ...base, state: 'no-after' }
        const ready = last + AFTER_START_DAYS * DAY + MIN_AFTER_SCANS * scanIntervalHours * 60 * 60 * 1000
        return { ...base, state: 'measuring', daysLeft: Math.max(1, Math.ceil((ready - time(now)) / DAY)) }
    }

    // Only engines present in both windows: a plan change that adds an engine must not move the number
    const engines = [...before.avg.keys()]
        .filter((name) => after.avg.has(name))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ name, before: before.avg.get(name)!, after: after.avg.get(name)! }))
    if (engines.length === 0) return { ...base, state: 'no-before' }

    const mean = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) / xs.length)
    const b = mean(engines.map((e) => e.before))
    const a = mean(engines.map((e) => e.after))
    const delta = a - b
    return {
        ...base,
        state: over ? 'final' : 'interim',
        before: b,
        after: a,
        delta,
        result: delta > FLAT_BAND ? 'up' : delta < -FLAT_BAND ? 'down' : 'flat',
        engines
    }
}

const biggest = (groups: IFixGroup[]) => groups.reduce<IFixGroup | null>((best, g) => (!best || (g.delta ?? 0) > (best.delta ?? 0) ? g : best), null)

// Monday email: a final, positive result not emailed yet
export const pickEmailGroup = (groups: IFixGroup[]) => biggest(groups.filter((g) => g.state === 'final' && g.result === 'up' && !g.emailed))

// Overview card: the best positive result (so far or final) from the last 60 days
export const pickOverviewGroup = (groups: IFixGroup[], now: Date) =>
    biggest(
        groups.filter((g) => (g.state === 'interim' || g.state === 'final') && g.result === 'up' && time(now) - time(g.end) <= OVERVIEW_DAYS * DAY)
    )

// The Monday email's one line for a final, positive group
export const fixResultLine = (g: IFixGroup) => {
    const name = g.fixes.length === 1 ? g.fixes[0].text : `${g.fixes[0].text} + ${g.fixes.length - 1} more`
    const date = new Date(g.fixes[0].doneAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
    return `Result: after ${name} (${date}) your AI visibility went from ${g.before}% to ${g.after}% ↑`
}

// Every group of the brand's recent work, newest first
export const getFixImpact = async (brandId: string, plan: PlanName, now = new Date()): Promise<IFixGroup[]> => {
    const events = (await fixEventModel
        .find({ brandId, undoneAt: null, doneAt: { $gte: new Date(time(now) - LOOKBACK_DAYS * DAY) } })
        .lean()) as unknown as IFixEvent[]
    const groups = groupFixEvents(events)
    if (groups.length === 0) return []
    const from = new Date(time(groups[0][0].doneAt) - BEFORE_DAYS * DAY)
    const scans = await databseService.getVisibilityTrendByBrandId(brandId, 1000, from)
    const interval = SCAN_INTERVAL_HOURS[plan] ?? SCAN_INTERVAL_HOURS.free
    return groups.map((g) => measureGroup(g, scans, now, interval)).reverse()
}
