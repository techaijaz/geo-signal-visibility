// backend/src/service/competitorService.ts
// Brand vs competitors, counted from the AI answers of a scan. Used by the Competitors page and PDF reports
// so both always show the same numbers.
import mongoose from 'mongoose'
import mentionModel from '../model/mentionModel'
import { IMention } from '../types/mentionTypes'

export interface ICompetitorRow {
    name: string
    isYou: boolean
    answersNamed: number
    mentionRate: number // % of answers that name this brand
    share: number // % of all brand mentions (share of voice)
    avgPosition: number | null
    trend: 'rising' | 'falling' | 'flat' | null // null = no previous scan to compare with
}

export interface ICompetitorStats {
    totalAnswers: number
    // False for scans made before answer text was stored: competitors can't be counted from those
    answerTextAvailable: boolean
    rows: ICompetitorRow[]
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Whole-name match, so "Glow" is not counted inside "Glowleaf"
export const nameMatcher = (name: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}($|[^\\p{L}\\p{N}])`, 'iu')

// Same rule as the scan uses for your brand: number of the list item it appears in, else its line (max 5)
export const positionIn = (text: string, re: RegExp): number | null => {
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
            const numbered = lines[i].match(/^\s*(\d+)[.)]/)
            return numbered ? parseInt(numbered[1], 10) : Math.min(i + 1, 5)
        }
    }
    return null
}

// Whole percentages that always add up to 100 (largest remainder method)
const shares = (counts: number[]) => {
    const total = counts.reduce((a, b) => a + b, 0)
    if (!total) return counts.map(() => 0)
    const raw = counts.map((c) => (c / total) * 100)
    const out = raw.map(Math.floor)
    const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0])
    for (let k = 0; k < 100 - out.reduce((a, b) => a + b, 0); k++) out[order[k][1]]++
    return out
}

const average = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)

const countFor = (mentions: IMention[], brandName: string, competitors: string[]) => {
    const withText = mentions.filter((m) => m.rawText)
    const you = {
        name: brandName,
        isYou: true,
        named: mentions.filter((m) => m.mentioned).length,
        positions: mentions.filter((m) => m.mentioned && m.position).map((m) => m.position as number),
        total: mentions.length
    }
    const others = competitors.map((name) => {
        const re = nameMatcher(name)
        const hits = withText.filter((m) => re.test(m.rawText || ''))
        return {
            name,
            isYou: false,
            named: hits.length,
            positions: hits.map((m) => positionIn(m.rawText || '', re)).filter((p): p is number => p !== null),
            total: withText.length
        }
    })
    return { you, others, withText: withText.length }
}

const rate = (named: number, total: number) => (total ? Math.round((named / total) * 100) : 0)

export const computeCompetitorStats = (
    brandName: string,
    competitors: string[],
    mentions: IMention[],
    previous: IMention[] = []
): ICompetitorStats => {
    const names = competitors.map((c) => c.trim()).filter(Boolean)
    const current = countFor(mentions, brandName, names)
    const prev = previous.length ? countFor(previous, brandName, names) : null
    const all = [current.you, ...current.others]
    const shareOf = shares(all.map((r) => r.named))

    const rows: ICompetitorRow[] = all.map((r, i) => {
        const mentionRate = rate(r.named, r.total)
        let trend: ICompetitorRow['trend'] = null
        const p = prev ? [prev.you, ...prev.others][i] : null
        if (p && p.total > 0 && (r.isYou || prev!.withText > 0)) {
            const diff = mentionRate - rate(p.named, p.total)
            trend = diff >= 5 ? 'rising' : diff <= -5 ? 'falling' : 'flat'
        }
        return {
            name: r.name,
            isYou: r.isYou,
            answersNamed: r.named,
            mentionRate,
            share: shareOf[i],
            avgPosition: average(r.positions),
            trend
        }
    })

    return { totalAnswers: mentions.length, answerTextAvailable: current.withText > 0, rows }
}

// Mentions of the latest scan and the one before it (for trends)
export const loadScanPair = async (brandId: string, lastScanId?: string | null) => {
    if (!lastScanId) {
        return { current: (await mentionModel.find({ brandId }).lean()) as IMention[], previous: [] as IMention[] }
    }
    const [prevScan] = await mentionModel.aggregate([
        { $match: { brandId: new mongoose.Types.ObjectId(brandId), scanId: { $nin: [null, lastScanId] } } },
        { $group: { _id: '$scanId', at: { $max: '$extractedAt' } } },
        { $sort: { at: -1 } },
        { $limit: 1 }
    ])
    const current = (await mentionModel.find({ brandId, scanId: lastScanId }).lean()) as IMention[]
    const previous = prevScan ? ((await mentionModel.find({ brandId, scanId: prevScan._id }).lean()) as IMention[]) : []
    return { current, previous }
}
