// backend/src/service/competitorService.ts
// Brand vs competitors, counted from the AI answers of a scan. Used by the Competitors page and PDF reports
// so both always show the same numbers.
import mongoose from 'mongoose'
import mentionModel from '../model/mentionModel'
import { IBrandNamed, IMention } from '../types/mentionTypes'
import { linePosition } from '../util/listPosition'

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
    const i = lines.findIndex((line) => re.test(line))
    return i === -1 ? null : linePosition(lines, i)
}

// One key per brand however it is spelled: "AdilQadri", "Adil Qadri" and "adil-qadri" are the same
export const brandKey = (name: string) =>
    name
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, '')

// Shops, marketplaces and platforms the AI names next to brands; they are not competitors
const NOT_BRANDS = new Set(
    [
        'Amazon',
        'Amazon India',
        'Flipkart',
        'Nykaa',
        'Nykaa Man',
        'Myntra',
        'Meesho',
        'Ajio',
        'Tata Cliq',
        'Tata CLiQ Luxury',
        'Purplle',
        'Snapdeal',
        'JioMart',
        'BigBasket',
        'Blinkit',
        'Zepto',
        'Swiggy Instamart',
        'Instamart',
        'FirstCry',
        'Shoppers Stop',
        'Lifestyle',
        'Pantaloons',
        'Croma',
        'Reliance Digital',
        'Paytm Mall',
        'IndiaMART',
        'Smytten',
        'Walmart',
        'Target',
        'Sephora',
        'Ulta',
        'eBay',
        'Etsy',
        'AliExpress',
        'Noon',
        'Shopify',
        'Google',
        'YouTube',
        'Instagram',
        'Facebook',
        'Reddit',
        'Quora',
        'WhatsApp',
        // Review and reference sites, also as the AI misspells them
        'Fragrantica',
        'Fragnatica',
        'Basenotes',
        'Parfumo',
        'Wikipedia'
    ].map(brandKey)
)
export const isNotBrand = (name: string) => NOT_BRANDS.has(brandKey(name))

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

export interface ILostTo {
    totalAnswers: number
    extracted: boolean
    you: { named: number; bestPosition: number | null; closestWin: { queryText: string; model: string; position: number } | null }
    brands: Array<{ name: string; answers: number; avgPosition: number | null; aheadOfYou: number; tracked: boolean }>
    byQuestion: Array<{ queryText: string; rows: Array<{ model: string; you: number | null; others: IBrandNamed[] }> }>
    topActions: Array<{ _id: string; text: string }>
}

// Who the AI recommends instead of the brand, from one scan's answers (lost-to list)
export const computeLostTo = (mentions: IMention[], brandName: string, tracked: string[], recs: Array<{ _id: unknown; text: string }>): ILostTo => {
    const extracted = mentions.some((m) => Array.isArray(m.brandsNamed))
    const trackedSet = new Set(tracked.map(brandKey))
    const own = brandKey(brandName)
    // Scans saved before these rules may hold spelling variants, shops and markdown-list positions:
    // clean them here and read positions again from the answer text
    const cleaned = new Map<IMention, IBrandNamed[]>()
    for (const m of mentions) {
        const seen = new Set<string>()
        const list: IBrandNamed[] = []
        for (const b of m.brandsNamed || []) {
            const key = brandKey(b.name)
            if (!key || key === own || seen.has(key) || NOT_BRANDS.has(key)) continue
            seen.add(key)
            list.push({ name: b.name, position: m.rawText ? (positionIn(m.rawText, nameMatcher(b.name)) ?? b.position) : b.position })
        }
        cleaned.set(m, list)
    }
    const youAt = (m: IMention) => (m.mentioned ? (m.rawText ? (positionIn(m.rawText, nameMatcher(brandName)) ?? m.position) : m.position) : null)

    const byName = new Map<string, { spellings: Map<string, number>; positions: number[]; answers: number; ahead: number }>()
    for (const m of mentions) {
        const you = youAt(m)
        for (const b of cleaned.get(m) || []) {
            const key = brandKey(b.name)
            const row = byName.get(key) || { spellings: new Map<string, number>(), positions: [], answers: 0, ahead: 0 }
            row.spellings.set(b.name, (row.spellings.get(b.name) || 0) + 1)
            row.answers++
            if (b.position) row.positions.push(b.position)
            if (!m.mentioned || (b.position !== null && you !== null && b.position < you)) row.ahead++
            byName.set(key, row)
        }
    }
    // Shown under its most used spelling
    const nameOf = (spellings: Map<string, number>) => [...spellings.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const shown = new Map([...byName.entries()].map(([key, r]) => [key, nameOf(r.spellings)]))
    const brands = [...byName.entries()]
        .map(([key, r]) => ({
            name: shown.get(key) as string,
            answers: r.answers,
            avgPosition: average(r.positions),
            aheadOfYou: r.ahead,
            tracked: trackedSet.has(key)
        }))
        .sort((a, b) => b.answers - a.answers || (a.avgPosition ?? 99) - (b.avgPosition ?? 99))
        .slice(0, 20)

    const named = mentions.filter((m) => m.mentioned)
    const best = named
        .map((m) => ({ ...m, position: youAt(m) }))
        .filter((m) => m.position)
        .sort((a, b) => (a.position as number) - (b.position as number))[0]
    const questions = new Map<string, ILostTo['byQuestion'][number]>()
    for (const m of mentions) {
        const q = questions.get(m.queryText) || { queryText: m.queryText, rows: [] }
        q.rows.push({
            model: m.model,
            you: youAt(m),
            others: (cleaned.get(m) || []).map((b) => ({ ...b, name: shown.get(brandKey(b.name)) ?? b.name }))
        })
        questions.set(m.queryText, q)
    }
    return {
        totalAnswers: mentions.length,
        extracted,
        you: {
            named: named.length,
            bestPosition: best ? (best.position as number) : null,
            closestWin: best ? { queryText: best.queryText, model: best.model, position: best.position as number } : null
        },
        brands,
        byQuestion: [...questions.values()],
        topActions: recs.slice(0, 3).map((r) => ({ _id: String(r._id), text: r.text }))
    }
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
