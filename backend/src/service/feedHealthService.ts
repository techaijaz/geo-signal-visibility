// Product feed health: how ready each Shopify product's data is for AI shopping (ChatGPT Shopping and
// similar), against OpenAI's product feed rules. Pure scoring here; no AI calls.
import { auditService } from './auditService'
import { fetchShopifyProducts } from './productService'

export interface IFeedCheck {
    key: 'description' | 'title' | 'brand' | 'image' | 'images' | 'price' | 'stock' | 'category' | 'gtin'
    label: string
    // null: not checked (GTIN needs the Shopify connection)
    pass: boolean | null
    points: number
    max: number
    detail: string
}

export interface IFeedProduct {
    url: string
    name: string
    score: number
    level: 'good' | 'warn' | 'bad'
    checks: IFeedCheck[]
}

export interface IFeedHealth {
    checkedAt: Date
    shopify: boolean
    total: number
    score: number | null
    summary: Array<{ key: IFeedCheck['key']; label: string; failing: number }>
    products: IFeedProduct[]
    // Over 1000 products: only the first 1000 were checked
    truncated: boolean
    // A later catalogue page couldn't be read, so some products are missing
    partial: boolean
}

interface IShopifyItem {
    title?: string
    handle?: string
    vendor?: string
    product_type?: string
    body_html?: string
    images?: Array<{ src?: string }>
    variants?: Array<{ price?: string; compare_at_price?: string | null; available?: boolean }>
}

// Product types that say nothing about the product (some come from WooCommerce imports)
const PLACEHOLDER_TYPES = new Set(['variable', 'simple', 'default', 'product', 'products', 'grouped', 'external', 'bundle'])

const plainText = (html: string) =>
    html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        // "don&rsquo;t" is one word
        .replace(/&(rsquo|lsquo|apos|#39|#x27|#8217);/gi, "'")
        .replace(/&#?\w+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

const isJpegOrPng = (src: string) => {
    try {
        return /\.(jpe?g|png)$/i.test(new URL(src).pathname)
    } catch {
        return false
    }
}

const check = (key: IFeedCheck['key'], label: string, pass: boolean, max: number, detail: string): IFeedCheck => ({
    key,
    label,
    pass,
    points: pass ? max : 0,
    max,
    detail
})

const levelOf = (score: number): IFeedProduct['level'] => (score >= 80 ? 'good' : score >= 50 ? 'warn' : 'bad')

export const scoreFeedProduct = (raw: unknown, origin: string): IFeedProduct | null => {
    const p = raw as IShopifyItem | null
    if (!p || typeof p.title !== 'string' || !p.handle) return null
    const title = p.title.trim()
    const text = plainText(p.body_html || '')
    const words = text ? text.split(' ').length : 0
    const images = (p.images || []).map((i) => i.src || '').filter(Boolean)
    const variants = p.variants || []
    const first = variants[0]
    const price = parseFloat(first?.price || '')
    const mrp = parseFloat(first?.compare_at_price || '')
    const type = (p.product_type || '').trim()
    const allCaps = title === title.toUpperCase() && /\p{Lu}/u.test(title)

    // Compare-at equal to the price means no discount (fine); only an MRP below the price is wrong
    const priceOk = price > 0 && (isNaN(mrp) || mrp >= price)
    const priceDetail = !(price > 0) ? 'No price above 0' : priceOk ? `₹${price}` : `Compare-at price ₹${mrp} is below the price ₹${price}`

    const checks: IFeedCheck[] = [
        check(
            'description',
            'Description',
            words >= 50 && text.length <= 5000,
            25,
            text.length > 5000 ? `${text.length} characters (max 5,000)` : `${words} words`
        ),
        check('title', 'Title', title.length >= 15 && title.length <= 150 && !allCaps, 15, allCaps ? 'All capitals' : `${title.length} characters`),
        check('brand', 'Brand', !!(p.vendor || '').trim(), 10, (p.vendor || '').trim() || 'No vendor'),
        check(
            'image',
            'Main image',
            !!images[0] && isJpegOrPng(images[0]),
            10,
            !images[0] ? 'No image' : isJpegOrPng(images[0]) ? 'JPEG/PNG' : 'Not JPEG or PNG'
        ),
        check('images', 'Extra images', images.length >= 2, 10, `${images.length} image${images.length === 1 ? '' : 's'}`),
        check('price', 'Price', priceOk, 10, priceDetail),
        check(
            'stock',
            'Stock',
            variants.some((v) => v.available),
            10,
            variants.some((v) => v.available) ? 'In stock' : 'Out of stock'
        ),
        check('category', 'Category', !!type && !PLACEHOLDER_TYPES.has(type.toLowerCase()), 10, type || 'No product type'),
        { key: 'gtin', label: 'GTIN / barcode', pass: null, points: 0, max: 0, detail: 'Connect Shopify to check' }
    ]
    const score = checks.reduce((sum, c) => sum + c.points, 0)
    return { url: `${origin}/products/${p.handle}`, name: title || p.handle, score, level: levelOf(score), checks }
}

// The store's average and how many products fail each check, biggest gap first; weakest products first
export const summarizeFeed = (products: IFeedProduct[], shopify: boolean, truncated = false, partial = false): IFeedHealth => {
    const failing = new Map<IFeedCheck['key'], { label: string; failing: number }>()
    for (const p of products) {
        for (const c of p.checks) {
            if (c.pass !== false) continue
            const row = failing.get(c.key) || { label: c.label, failing: 0 }
            row.failing++
            failing.set(c.key, row)
        }
    }
    return {
        checkedAt: new Date(),
        shopify,
        total: products.length,
        score: products.length ? Math.round(products.reduce((sum, p) => sum + p.score, 0) / products.length) : null,
        summary: [...failing.entries()].map(([key, r]) => ({ key, label: r.label, failing: r.failing })).sort((a, b) => b.failing - a.failing),
        products: [...products].sort((a, b) => a.score - b.score),
        truncated,
        partial
    }
}

// "https://www.store.com/products/x/?v=1" and "https://store.com/products/x" are the same product
const productKey = (url: string) => {
    try {
        const u = new URL(url)
        return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase()
    } catch {
        return ''
    }
}

// Saved feed scores by product, built once per request for the Products page column
export const feedScores = (feed: Pick<IFeedHealth, 'products'> | null | undefined): Map<string, number> =>
    new Map((feed?.products || []).map((p) => [productKey(p.url), p.score]))

export const feedScoreFor = (url: string, scores: Map<string, number>): number | null => scores.get(productKey(url)) ?? null

// A store blip (timeout, 5xx) reads as "not Shopify" or a cut catalogue; keep the last good result instead
export const keepSavedFeed = (saved: Pick<IFeedHealth, 'shopify'> | null | undefined, fresh: Pick<IFeedHealth, 'shopify' | 'partial'>): boolean =>
    !!saved?.shopify && (!fresh.shopify || fresh.partial)

// Read the store's catalogue (Shopify products.json, up to 1000 products) and score every product
export const runFeedHealth = async (website: string, fetchText?: (url: string) => Promise<string>): Promise<IFeedHealth> => {
    const origin = new URL(auditService.cleanUrl(website)).origin
    const { shopify, raw, truncated, partial } = await fetchShopifyProducts(website, fetchText)
    const products = shopify ? raw.map((r) => scoreFeedProduct(r, origin)).filter((p): p is IFeedProduct => !!p) : []
    return summarizeFeed(products, shopify, truncated, partial)
}
