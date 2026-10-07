// Product feed health: how ready each Shopify product's data is for AI shopping (ChatGPT Shopping and
// similar), against OpenAI's product feed rules. Pure scoring here; no AI calls.

export interface IFeedCheck {
    key: 'description' | 'title' | 'brand' | 'image' | 'images' | 'price' | 'stock' | 'category' | 'gtin'
    label: string
    // null: not checked (GTIN needs the Shopify connection)
    pass: boolean | null
    points: number
    max: number
    detail: string
    tip?: string
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

// What to change in Shopify admin for each gap
const TIPS: Record<Exclude<IFeedCheck['key'], 'gtin'>, string> = {
    description:
        'AI shopping feeds need a real description: write 50+ words of plain text (what it is, notes or ingredients, size, who it is for) in Products → this product → Description.',
    title: 'Use a title of 15–150 characters in normal case, with the product name and its kind (e.g. "Silk Oud Alcohol Free Attar 12ml"), in Products → Title.',
    brand: 'Set the brand in Products → this product → Vendor; feeds need it on every product.',
    image: 'Add a main product image in JPEG or PNG (feeds may skip WebP or missing images) in Products → Media.',
    images: 'Add at least 2 images (front, box or in use) in Products → Media; AI shopping shows products with more views.',
    price: 'Check the price in Products → Pricing: it must be above 0, and "Compare-at price" (MRP) must not be lower than the price.',
    stock: "Every variant is out of stock, so feeds list it as unavailable and AI won't recommend it. Update stock in Products → this product → Inventory, or hide the product if it is discontinued.",
    category: 'Set a Product type (e.g. "Attar", "Perfume") in Products → Product organization, so AI can place the product in the right category.'
}

// Shopify's own product types that say nothing about the product
const PLACEHOLDER_TYPES = new Set(['variable', 'simple', 'default', 'product', 'products', 'grouped', 'external', 'bundle'])

const plainText = (html: string) =>
    html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
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
    detail,
    ...(pass || key === 'gtin' ? {} : { tip: TIPS[key as Exclude<IFeedCheck['key'], 'gtin'>] })
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
export const summarizeFeed = (products: IFeedProduct[], shopify: boolean): IFeedHealth => {
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
        products: [...products].sort((a, b) => a.score - b.score)
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

// A saved product's feed score, for the Products page column
export const feedScoreFor = (url: string, feed: IFeedHealth | null | undefined): number | null => {
    const key = productKey(url)
    if (!key || !feed?.products) return null
    return feed.products.find((p) => productKey(p.url) === key)?.score ?? null
}
