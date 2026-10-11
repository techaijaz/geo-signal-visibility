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

const wholeBrand = (products: IBrandProduct[], max: number) => {
    const urls: string[] = []
    for (const { kind } of kindsOf(products)) {
        urls.push(
            ...withUrl(products)
                .filter((p) => kindOf(p) === kind)
                .slice(0, WHOLE_PER_KIND)
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
