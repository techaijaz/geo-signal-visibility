// Products of a brand: the Shopify list, short names, and how often AI answers name each product.
// Everything here except fetchShopifyProducts and aiShortNames is pure, for the check script.
import { IBrandProduct } from '../types/brandTypes'
import { brandKey } from './competitorService'

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
