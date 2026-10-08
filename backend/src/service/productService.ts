// Products of a brand: the Shopify list, short names, and how often AI answers name each product.
// Everything here except fetchShopifyProducts and aiShortNames is pure, for the check script.
import { IBrandProduct } from '../types/brandTypes'
import { IMention } from '../types/mentionTypes'
import { fetchPublicText } from '../util/publicUrl'
import aiService from './aiService'
import { auditService } from './auditService'
import { brandKey, nameMatcher } from './competitorService'
import { linePosition, listNumber } from '../util/listPosition'
import { FILLER_WORDS, GENERIC_WORDS, productKind } from './productKinds'

export interface IProductCandidate extends IBrandProduct {
    hidden: boolean
    hiddenReason: '' | 'free' | 'sample' | 'gift' | 'duplicate'
}

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
    const firstFiller = all.findIndex((w) => FILLER_WORDS.has(w.toLowerCase()))
    let name = firstFiller === -1 ? all : all.slice(0, firstFiller)
    if (name[0]?.toLowerCase() === 'the') name = name.slice(1)
    if (!name.length) name = all.filter((w) => !FILLER_WORDS.has(w.toLowerCase()))
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
    // "Fresh Aromatic" describes the product; a name needs at least one word that isn't a describing word
    if (ws.every((w) => FILLER_WORDS.has(w.toLowerCase()))) return null
    // "Hasanoud Passion" is refused; "Passion Oud" is fine although "oud" sits inside "hasanoud":
    // a word is the brand only when the brand key starts with it and it is longer than 3 letters
    const own = brandKey(brandName)
    if (own && (brandKey(clean).includes(own) || ws.some((w) => brandKey(w).length > 3 && own.startsWith(brandKey(w))))) return null
    // A name in capitals ("OUD ELEGANCE") is written normally; acronyms in a mixed name ("Rose EDP") stay
    return clean === clean.toUpperCase() && /\p{Lu}/u.test(clean) ? ws.map(titleCase).join(' ') : clean
}

// Only the product fields; the brand's products may be Mongoose subdocuments, whose spread copies internals
const plainProduct = (p: IBrandProduct): IBrandProduct => ({
    shopifyId: p.shopifyId ?? null,
    title: p.title,
    shortName: p.shortName,
    aliases: [...(p.aliases || [])],
    url: p.url || '',
    price: p.price ?? null,
    image: p.image || '',
    productType: p.productType || '',
    nameEditedByUser: !!p.nameEditedByUser
})

// Shopify refresh: store facts update, names the user chose stay
export const mergeRefresh = (saved: IBrandProduct[], fresh: IProductCandidate[]): IBrandProduct[] => {
    const byId = new Map(fresh.filter((f) => f.shopifyId).map((f) => [f.shopifyId as string, f]))
    return saved.map(plainProduct).map((s) => {
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

// Also generic: one word of the brand's own name ("Hasan" for Hasan Oud) would match every brand mention
export const isGenericName = (name: string, brandName = '') => {
    if (words(name).length !== 1) return false
    const key = brandKey(name)
    return GENERIC_WORDS.has(name.trim().toLowerCase()) || (!!key && brandKey(brandName).includes(key))
}

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

const lineOf = (line: string) =>
    line
        .replace(/[*_#>`]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200)

// The brand's name as whole words in any spacing: "Hasan Oud", "HasanOud", "Hasan-Oud"
const brandMatcher = (brandName: string) => {
    const ws = words(brandName).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    return ws.length ? new RegExp(`(^|[^\\p{L}\\p{N}])${ws.join('[\\s-]*')}($|[^\\p{L}\\p{N}])`, 'iu') : null
}

// The lines of the list item a line belongs to: from its number line to the next one
const itemLines = (lines: string[], i: number) => {
    let start = i
    while (start > 0 && listNumber(lines[start]) === null) start--
    if (listNumber(lines[start]) === null) return [lines[i]]
    // The item ends at the next number, or at a blank line followed by an unindented line (a closing paragraph)
    let end = start + 1
    while (end < lines.length && listNumber(lines[end]) === null) {
        if (!lines[end].trim() && end + 1 < lines.length && /^\S/.test(lines[end + 1]) && listNumber(lines[end + 1]) === null) break
        end++
    }
    return lines.slice(start, end)
}

// Answers that name this product. The brand must be named in the same list item (or the same line
// outside a list), so another brand's product with the same name is not counted
const hitsFor = (mentions: IMention[], brandName: string, p: IBrandProduct): IProductHit[] => {
    const brandRe = brandMatcher(brandName)
    if (!brandRe) return []
    const names = [p.shortName, ...(p.aliases || []).filter((a) => !isGenericName(a, brandName))].filter(Boolean)
    const matchers = names.map(nameMatcher)
    const hits: IProductHit[] = []
    for (const m of mentions) {
        const text = m.rawText || ''
        if (!text || !brandRe.test(text)) continue
        const lines = text.split('\n')
        const i = lines.findIndex((l, n) => matchers.some((r) => r.test(l)) && itemLines(lines, n).some((x) => brandRe.test(x)))
        if (i === -1) continue
        hits.push({ queryText: m.queryText, model: m.model, position: linePosition(lines, i), line: lineOf(lines[i]) })
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
        const genericName = isGenericName(p.shortName, brandName)
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
        notSeen: rows.filter((r) => !r.overLimit && !r.genericName && !r.answers).length,
        products: rows
    }
}

// "600 ke andar sabse accha attar" and "Shaadi ke liye best attar": the product's kind, the buyer's budget and
// the occasions buyers of that kind ask about, for any D2C category, no AI
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
    const found = productKind(product.title, product.productType || '')
    if (!found || !product.price) return []
    const { kind, occasions } = found
    const budget = budgetFor(product.price)
    const seen = new Set(existing.map(questionKey))
    const occasion = (t: string) => t.replace('{k}', kind)
    return [
        { text: `${budget} ke andar sabse accha ${kind}`, lang: 'HI-EN' as const, intent: 'Price' as const },
        { text: occasion(occasions[0]), lang: 'HI-EN' as const, intent: 'Occasion' as const },
        { text: `Best ${kind} under ₹${budget} in India`, lang: 'EN' as const, intent: 'Price' as const },
        { text: occasion(occasions[1]), lang: 'HI-EN' as const, intent: 'Occasion' as const }
    ].filter((q) => !seen.has(questionKey(q.text)))
}

const PAGE = 250
const MAX_PAGES = 4

// Every Shopify store serves its catalogue at /products.json; anything else means "not Shopify"
export const fetchShopifyProducts = async (
    website: string,
    fetchText: (url: string) => Promise<string> = (url) => fetchPublicText(url, { Accept: 'application/json' })
): Promise<{ shopify: boolean; raw: unknown[]; truncated: boolean; partial: boolean }> => {
    const origin = new URL(auditService.cleanUrl(website)).origin
    const raw: unknown[] = []
    for (let n = 1; n <= MAX_PAGES; n++) {
        let products: unknown
        try {
            products = (JSON.parse(await fetchText(`${origin}/products.json?limit=${PAGE}&page=${n}`)) as { products?: unknown }).products
        } catch {
            products = undefined
        }
        // An empty store on page 1 is treated like no store: the user gets the manual form
        if (!Array.isArray(products) || (n === 1 && !products.length))
            // A later page that fails (rather than coming back empty) leaves the catalogue partial
            return n === 1
                ? { shopify: false, raw: [], truncated: false, partial: false }
                : { shopify: true, raw, truncated: false, partial: !Array.isArray(products) }
        raw.push(...(products as unknown[]))
        if (products.length < PAGE) return { shopify: true, raw, truncated: false, partial: false }
    }
    return { shopify: true, raw, truncated: true, partial: false }
}

const namesPrompt = (
    titles: string[]
) => `Shorten each store product title to the name a shopper would say, 1 to 3 words, using only words from the title.
Drop the brand name, sizes and describing words ("Premium", "Alcohol Free", "Long Lasting", "Attar", "Perfume").
Reply with JSON only: {"0": "Name", "1": "Name", ...}.

${titles.map((t, i) => `${i}: ${t}`).join('\n')}`

// One cheap call for all titles; the AI only proposes, validateAiShortName decides
export const aiShortNames = async (titles: string[], brandName: string): Promise<Array<string | null>> => {
    const reply = await aiService.callAnyAvailableAi(namesPrompt(titles), 800)
    let parsed: Record<string, unknown> = {}
    try {
        const match = reply?.match(/\{[\s\S]*\}/)
        parsed = match ? (JSON.parse(match[0]) as Record<string, unknown>) : {}
    } catch {
        parsed = {}
    }
    return titles.map((t, i) => validateAiShortName(parsed[String(i)], t, brandName))
}

// A save may not raise the count past the plan; after a downgrade, removing and renaming still work
export const canSaveProducts = (nextCount: number, currentCount: number, maxProducts: number) => nextCount <= maxProducts || nextCount <= currentCount
