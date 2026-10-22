import { productKind } from '../productKinds'
import { brandKey } from '../competitorService'
import type { IBrandProduct } from '../../types/brandTypes'
import type { ILostTo } from '../competitorService'
import type { FixType } from '../../types/fixTypes'

export const OTHER_KIND = 'Other'
const PER_KIND = 5
const WHOLE_PER_KIND = 2
const WHOLE_MAX = 8
const COMPARE_MAX = 4

const kindOf = (p: IBrandProduct) => productKind(p.title, p.productType)?.kind ?? OTHER_KIND
const withUrl = (products: IBrandProduct[]) => products.filter((p) => p.url)

// Saved products grouped by kind, biggest first; "Other" last
export const kindsOf = (products: IBrandProduct[]) => {
    const counts = new Map<string, number>()
    for (const p of withUrl(products)) counts.set(kindOf(p), (counts.get(kindOf(p)) ?? 0) + 1)
    return [...counts.entries()]
        .map(([kind, count]) => ({ kind, count }))
        .sort((a, b) => (a.kind === OTHER_KIND ? 1 : b.kind === OTHER_KIND ? -1 : b.count - a.count))
}

// 2 per kind, or more when there are few kinds (a store with one kind still fills the page budget)
export const wholeBrand = (products: IBrandProduct[], max: number) => {
    const kinds = kindsOf(products)
    const perKind = Math.max(WHOLE_PER_KIND, Math.floor(max / Math.max(kinds.length, 1)))
    const urls: string[] = []
    for (const { kind } of kinds) {
        urls.push(
            ...withUrl(products)
                .filter((p) => kindOf(p) === kind)
                .slice(0, perKind)
                .map((p) => p.url)
        )
    }
    return urls.slice(0, max)
}

// Questions where the AI named this competitor
export const wonQueries = (byQuestion: ILostTo['byQuestion'], competitor: string) => {
    const key = brandKey(competitor)
    return byQuestion.filter((q) => q.rows.some((r) => r.others.some((o) => brandKey(o.name) === key))).map((q) => q.queryText)
}

// Our own product pages to read for this fix
export const pickOwnUrls = (input: {
    type: FixType
    kind?: string | null
    competitor?: string | null
    products: IBrandProduct[]
    byQuestion?: ILostTo['byQuestion']
}): string[] => {
    const { products } = input
    if (input.type === 'comparison') {
        const kinds = new Set(
            wonQueries(input.byQuestion ?? [], input.competitor ?? '')
                .map((q) => productKind(q)?.kind)
                .filter(Boolean)
        )
        const matching = withUrl(products).filter((p) => kinds.has(kindOf(p)))
        return matching.length ? matching.slice(0, COMPARE_MAX).map((p) => p.url) : wholeBrand(products, COMPARE_MAX)
    }
    if (!input.kind) return wholeBrand(products, WHOLE_MAX)
    return withUrl(products)
        .filter((p) => kindOf(p) === input.kind)
        .slice(0, PER_KIND)
        .map((p) => p.url)
}

// Competitors to offer for a comparison: the brands the AI named most often first (spellings merged),
// then tracked competitors it never named
export const rankCompetitors = (named: Array<{ name: string; answers: number }>, tracked: string[]) => {
    const byKey = new Map<string, { name: string; answers: number; best: number }>()
    for (const b of named) {
        const key = brandKey(b.name)
        if (!key) continue
        const seen = byKey.get(key)
        if (!seen) byKey.set(key, { name: b.name, answers: b.answers, best: b.answers })
        else {
            seen.answers += b.answers
            if (b.answers > seen.best) Object.assign(seen, { name: b.name, best: b.answers })
        }
    }
    const ranked = [...byKey.values()].sort((a, b) => b.answers - a.answers).map((b) => b.name)
    const keys = new Set([...byKey.keys()])
    return [...ranked, ...tracked.filter((t) => !keys.has(brandKey(t)))]
}
