// Products of a brand: the Shopify list, short names, and how often AI answers name each product.
// Everything here except fetchShopifyProducts and aiShortNames is pure, for the check script.
import { IBrandProduct } from '../types/brandTypes'
import { IMention } from '../types/mentionTypes'
import { brandKey, nameMatcher, positionIn } from './competitorService'

export interface IProductCandidate extends IBrandProduct {
    hidden: boolean
    hiddenReason: '' | 'free' | 'sample' | 'gift' | 'duplicate'
}

// Words that describe a product rather than name it; the name is what comes before the first of these
const FILLER = new Set(
    (
        'premium fragrance fragrances alcohol free long lasting attar attars ittar perfume perfumes parfum eau de edp edt spray ' +
        'sample samples tester testers special powerful strong sweet fresh aromatic arabic luxury original unisex scent ' +
        'set combo pack gift for men women him her with and by from'
    ).split(' ')
)
const titleCase = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
const words = (s: string) => s.split(/\s+/).filter(Boolean)

// "Hasan Oud", "Hasanoud", "HASANOUD", "Hasan-Oud"
const brandPattern = (brandName: string) =>
    new RegExp(
        words(brandName)
            .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('[\\s-]*'),
        'giu'
    )

export const ruleShortName = (title: string, brandName: string): string => {
    const cleaned = title
        .replace(brandPattern(brandName), ' ')
        .replace(/\b\d+(\.\d+)?\s?(ml|g|gm|kg|l)\b/gi, ' ')
        .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
        // "Bag - Deep Olive": the part after a spaced dash is a variant
        .replace(/\s-\s.*$/, ' ')
    const all = words(cleaned)
    const firstFiller = all.findIndex((w) => FILLER.has(w.toLowerCase()))
    let name = firstFiller === -1 ? all : all.slice(0, firstFiller)
    if (name[0]?.toLowerCase() === 'the') name = name.slice(1)
    if (!name.length) name = all.filter((w) => !FILLER.has(w.toLowerCase()))
    return name.slice(0, 3).map(titleCase).join(' ')
}

const isSample = (title: string) => /\b(sample|tester)s?\b/i.test(title) || /\b[1-5]\s?ml\b/i.test(title)
const isGift = (title: string) => /gift\s*(card|packaging|wrap|box)/i.test(title)

interface IShopifyProduct {
    id?: number | string
    title?: string
    handle?: string
    product_type?: string
    variants?: Array<{ price?: string }>
    images?: Array<{ src?: string }>
}

export const cleanProductList = (raw: unknown[], brandName: string, origin: string): IProductCandidate[] => {
    if (!Array.isArray(raw)) return []
    const out: IProductCandidate[] = []
    for (const item of raw as IShopifyProduct[]) {
        if (!item || typeof item.title !== 'string' || !item.handle) continue
        const prices = (item.variants || []).map((v) => parseFloat(v.price || '')).filter((n) => !isNaN(n))
        const price = prices.length ? Math.min(...prices) : null
        const hiddenReason: IProductCandidate['hiddenReason'] = isGift(item.title) ? 'gift' : isSample(item.title) ? 'sample' : !price ? 'free' : ''
        out.push({
            shopifyId: item.id !== undefined ? String(item.id) : null,
            title: item.title.trim(),
            shortName: ruleShortName(item.title, brandName),
            aliases: [],
            url: `${origin}/products/${item.handle}`,
            price,
            image: item.images?.[0]?.src || '',
            productType: (item.product_type || '').trim(),
            nameEditedByUser: false,
            hidden: hiddenReason !== '',
            hiddenReason
        })
    }
    // Same short name twice among visible products: keep the dearest (the full size)
    const best = new Map<string, IProductCandidate>()
    for (const c of out.filter((c) => !c.hidden)) {
        const key = brandKey(c.shortName)
        const kept = best.get(key)
        if (!kept || (c.price ?? 0) > (kept.price ?? 0)) best.set(key, c)
    }
    for (const c of out) {
        if (!c.hidden && best.get(brandKey(c.shortName)) !== c) {
            c.hidden = true
            c.hiddenReason = 'duplicate'
        }
    }
    return out
}

export const validateAiShortName = (name: unknown, title: string, brandName: string): string | null => {
    if (typeof name !== 'string') return null
    const clean = name
        .replace(/["'`*]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    const ws = words(clean)
    if (ws.length < 1 || ws.length > 4) return null
    const titleWords = new Set(words(title.replace(/[^\p{L}\p{N}\s]/gu, ' ')).map(brandKey))
    if (!ws.every((w) => titleWords.has(brandKey(w)))) return null
    // "Hasanoud Passion" is refused; "Passion Oud" is fine although "oud" sits inside "hasanoud":
    // a word is the brand only when the brand key starts with it and it is longer than 3 letters
    const own = brandKey(brandName)
    if (own && (brandKey(clean).includes(own) || ws.some((w) => brandKey(w).length > 3 && own.startsWith(brandKey(w))))) return null
    return clean
}

// Shopify refresh: store facts update, names the user chose stay
export const mergeRefresh = (saved: IBrandProduct[], fresh: IProductCandidate[]): IBrandProduct[] => {
    const byId = new Map(fresh.filter((f) => f.shopifyId).map((f) => [f.shopifyId as string, f]))
    return saved.map((s) => {
        const f = s.shopifyId ? byId.get(s.shopifyId) : undefined
        if (!f) return s
        return {
            ...s,
            title: f.title,
            url: f.url,
            price: f.price,
            image: f.image,
            productType: f.productType,
            shortName: s.nameEditedByUser ? s.shortName : s.shortName || f.shortName
        }
    })
}

// One-word names that would match every fragrance or fashion answer
const GENERIC = new Set('oud rose amber musk classic gold black white blue silver royal premium original fresh noir red green pink night'.split(' '))
export const isGenericName = (shortName: string) => words(shortName).length === 1 && GENERIC.has(shortName.trim().toLowerCase())

export interface IProductHit {
    queryText: string
    model: string
    position: number | null
    line: string
}
export interface IProductRow {
    shortName: string
    title: string
    url: string
    price: number | null
    image: string
    answers: number
    previousAnswers: number | null
    bestPosition: number | null
    models: string[]
    hits: IProductHit[]
    genericName: boolean
    overLimit: boolean
}
export interface IProductVisibility {
    totalAnswers: number
    textAvailable: boolean
    counted: number
    notSeen: number
    products: IProductRow[]
}

const lineOf = (text: string, re: RegExp) =>
    (text.split('\n').find((l) => re.test(l)) || '')
        .replace(/[*_#>`]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200)

// Answers that name this product; only answers that also name the brand, so another brand's
// product with the same name is not counted
const hitsFor = (mentions: IMention[], brandName: string, p: IBrandProduct): IProductHit[] => {
    const own = brandKey(brandName)
    const matchers = [p.shortName, ...(p.aliases || [])].filter(Boolean).map(nameMatcher)
    const hits: IProductHit[] = []
    for (const m of mentions) {
        const text = m.rawText || ''
        if (!text || !brandKey(text).includes(own)) continue
        const re = matchers.find((r) => r.test(text))
        if (!re) continue
        hits.push({ queryText: m.queryText, model: m.model, position: positionIn(text, re), line: lineOf(text, re) })
    }
    return hits
}

export const computeProductVisibility = (
    mentions: IMention[],
    previous: IMention[],
    brandName: string,
    products: IBrandProduct[],
    maxProducts: number
): IProductVisibility => {
    const prevWithText = previous.filter((m) => m.rawText)
    const rows: IProductRow[] = products.map((p, i) => {
        const overLimit = i >= maxProducts
        const genericName = isGenericName(p.shortName)
        const hits = overLimit || genericName ? [] : hitsFor(mentions, brandName, p)
        const positions = hits.map((h) => h.position).filter((x): x is number => x !== null)
        return {
            shortName: p.shortName,
            title: p.title,
            url: p.url,
            price: p.price,
            image: p.image,
            answers: hits.length,
            previousAnswers: overLimit || genericName || !prevWithText.length ? null : hitsFor(prevWithText, brandName, p).length,
            bestPosition: positions.length ? Math.min(...positions) : null,
            models: [...new Set(hits.map((h) => h.model))],
            hits,
            genericName,
            overLimit
        }
    })
    // Named first (most answers, then best position), then not seen, then over the plan limit
    const rank = (r: IProductRow) => (r.overLimit ? 2 : r.answers ? 0 : 1)
    rows.sort((a, b) => rank(a) - rank(b) || b.answers - a.answers || (a.bestPosition ?? 99) - (b.bestPosition ?? 99))
    return {
        totalAnswers: mentions.length,
        textAvailable: mentions.some((m) => m.rawText),
        counted: Math.min(products.length, maxProducts),
        notSeen: rows.filter((r) => !r.overLimit && !r.answers).length,
        products: rows
    }
}

// "600 ke andar sabse accha attar": the product's kind and the buyer's budget, no AI
const KINDS: Array<[string, RegExp]> = [
    ['attar', /\b(attar|ittar|itr)\b/i],
    ['perfume', /\b(perfume|parfum|edp|edt|spray|scent)\b/i],
    ['deodorant', /\bdeo(dorant)?\b/i]
]
const budgetFor = (price: number) => {
    const step = price < 1000 ? 100 : price < 5000 ? 500 : 1000
    return Math.ceil(price / step) * step
}
const questionKey = (s: string) =>
    s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()

export const suggestProductQuestions = (product: IBrandProduct, existing: string[]) => {
    const kind = KINDS.find(([, re]) => re.test(product.title))?.[0] || product.productType.trim().toLowerCase()
    if (!kind || !product.price) return []
    const budget = budgetFor(product.price)
    const seen = new Set(existing.map(questionKey))
    return [
        { text: `${budget} ke andar sabse accha ${kind}`, lang: 'HI-EN' as const, intent: 'Price' as const },
        { text: `Best ${kind} under ₹${budget} in India`, lang: 'EN' as const, intent: 'Price' as const }
    ].filter((q) => !seen.has(questionKey(q.text)))
}
