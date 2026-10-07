// Store audit: how ready each product page (and a few collection pages) is for AI engines, with a fix for
// every gap. Scoring is pure; it reads the same facts as the AI Crawler View.
import * as cheerio from 'cheerio'
import { extractPageFacts, isShopifyHtml, openError } from './aiViewService'
import { auditService } from './auditService'
import { fetchPublicText } from '../util/publicUrl'
import orgModel from '../model/orgModel'
import { getPlanLimits, type PlanName } from '../config/planLimits'

export interface IStoreCheck {
    key: 'schema' | 'price' | 'reviews' | 'description' | 'faq' | 'alt' | 'meta'
    label: string
    pass: boolean
    points: number
    max: number
    detail: string
    tip?: string
}

export interface IStorePage {
    url: string
    name: string
    kind: 'product' | 'collection'
    score: number | null
    level: 'good' | 'warn' | 'bad' | null
    checks: IStoreCheck[]
    error?: string
}

const TIPS: Record<IStoreCheck['key'], { tip: string; shopify: string }> = {
    schema: {
        tip: "Add Product schema (JSON-LD) to the product template, in the page's HTML, so AI engines read the name, price and reviews reliably.",
        shopify: 'In Shopify, most themes include Product schema; check your theme or SEO app settings.'
    },
    price: {
        tip: "AI engines can't find a price. Put it in the page's HTML or in Product schema (offers.price).",
        shopify: 'In Shopify, check whether a price or currency app replaces the theme price with JavaScript.'
    },
    reviews: {
        tip: 'Add AggregateRating (average and number of reviews) to your Product schema; AI engines use ratings to pick what to recommend.',
        shopify: 'In Shopify, review apps like Judge.me or Loox have a setting to add rating schema; turn it on.'
    },
    description: {
        tip: 'Write at least 50 words on the page: what it is, notes or ingredients, who it is for and how to use it.',
        shopify: "In Shopify, put it in the product's Description field, not in an image or an app widget."
    },
    faq: {
        tip: 'Add 3–5 questions buyers ask ("Is it alcohol free?", "How long does it last?") with short answers, and FAQPage schema.',
        shopify: 'In Shopify, add an FAQ block to the product template or use an FAQ app that adds FAQPage schema.'
    },
    alt: {
        tip: 'Give every product image short alt text that names the product (e.g. "Silk Oud attar 12ml bottle").',
        shopify: "In Shopify, set alt text on each image in the product's Media section."
    },
    meta: {
        tip: 'Use a page title of 10–70 characters with the product name, and a meta description of 50–160 characters.',
        shopify: "In Shopify, edit both under 'Search engine listing' on the product page."
    }
}

const tipFor = (key: IStoreCheck['key'], shopify: boolean) => (shopify ? `${TIPS[key].tip} ${TIPS[key].shopify}` : TIPS[key].tip)

const check = (
    key: IStoreCheck['key'],
    label: string,
    pass: boolean,
    points: number,
    max: number,
    detail: string,
    shopify: boolean
): IStoreCheck => ({
    key,
    label,
    pass,
    points,
    max,
    detail,
    ...(pass ? {} : { tip: tipFor(key, shopify) })
})

// The page's own content: without scripts, header, menus, cart drawer and footer
const mainOf = (html: string) => {
    const $ = cheerio.load(html)
    $('script, style, noscript, template, svg, header, nav, footer, aside, [role="dialog"]').remove()
    const main = $('main, [role="main"]').first()
    return { $, root: main.length ? main : $('body') }
}

const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0)

const metaCheck = ($: cheerio.CheerioAPI, shopify: boolean) => {
    const title = $('title').first().text().trim()
    const desc = ($('meta[name="description"]').attr('content') || '').trim()
    const titleOk = title.length >= 10 && title.length <= 70
    const descOk = desc.length >= 50 && desc.length <= 160
    const detail = `Title ${title.length} characters, meta description ${desc ? `${desc.length} characters` : 'missing'}`
    return check('meta', 'Title and meta', titleOk && descOk, titleOk && descOk ? 5 : 0, 5, detail, shopify)
}

const levelOf = (score: number) => (score >= 80 ? 'good' : score >= 50 ? 'warn' : 'bad')

export const scoreProductPage = (html: string, url: string, shopify: boolean): IStorePage => {
    const facts = extractPageFacts(html)
    const types = facts.schemaTypes
    const { $, root } = mainOf(html)
    const words = wordCount(root.text())
    // FAQ: FAQPage schema, or at least two question headings written on the page
    const questions = root
        .find('h2, h3, h4, h5, dt, summary, strong')
        .toArray()
        .filter((el) => /\?\s*$/.test($(el).text().trim())).length
    const { total, withAlt } = facts.images
    // No images and no content at all is a broken page, not a perfect one
    const empty = !total && !words
    const altPoints = total ? Math.round((10 * withAlt) / total) : empty ? 0 : 10

    const checks: IStoreCheck[] = [
        check(
            'schema',
            'Product schema',
            types.includes('product'),
            types.includes('product') ? 25 : 0,
            25,
            types.includes('product') ? 'Found' : 'Missing',
            shopify
        ),
        check('price', 'Price', !!facts.price, facts.price ? 20 : 0, 20, facts.price ?? 'Not found in the HTML', shopify),
        check(
            'reviews',
            'Reviews schema',
            types.includes('aggregaterating'),
            types.includes('aggregaterating') ? 15 : 0,
            15,
            types.includes('aggregaterating') ? (facts.rating ?? 'Found') : 'No AggregateRating',
            shopify
        ),
        check('description', 'Description', words >= 50, words >= 50 ? 15 : 0, 15, `${words} words`, shopify),
        check(
            'faq',
            'FAQ',
            types.includes('faqpage') || questions >= 2,
            types.includes('faqpage') || questions >= 2 ? 10 : 0,
            10,
            types.includes('faqpage') ? 'FAQPage schema' : `${questions} question${questions === 1 ? '' : 's'} on the page`,
            shopify
        ),
        check(
            'alt',
            'Image alt text',
            total ? withAlt / total >= 0.8 : !empty,
            altPoints,
            10,
            total ? `${withAlt} of ${total} images have alt text` : empty ? 'No images or content' : 'No images',
            shopify
        ),
        metaCheck($, shopify)
    ]
    const score = checks.reduce((sum, c) => sum + c.points, 0)
    return { url, name: facts.name || url, kind: 'product', score, level: levelOf(score), checks }
}

// Collections get three checks and no score: they are lists, not products
export const scoreCollectionPage = (html: string, url: string, shopify: boolean): IStorePage => {
    const facts = extractPageFacts(html)
    const { $, root } = mainOf(html)
    const words = wordCount(root.text())
    const listSchema = facts.schemaTypes.some((t) => t === 'collectionpage' || t === 'itemlist' || t === 'collection')
    const checks: IStoreCheck[] = [
        {
            ...check(
                'schema',
                'Collection schema',
                listSchema,
                listSchema ? 1 : 0,
                1,
                listSchema ? 'Found' : 'No CollectionPage or ItemList',
                shopify
            ),
            ...(listSchema ? {} : { tip: 'Add CollectionPage or ItemList schema listing the products, so AI engines see the range.' })
        },
        {
            ...check('description', 'Description', words >= 30, words >= 30 ? 1 : 0, 1, `${words} words`, shopify),
            ...(words >= 30 ? {} : { tip: 'Write 30+ words at the top of the collection: what is in it and who it is for.' })
        },
        metaCheck($, shopify)
    ]
    return { url, name: facts.name || url, kind: 'collection', score: null, level: null, checks }
}

// ---- Which pages, and the run ----

const COLLECTIONS = 5
const AT_ONCE = 2
// The whole audit stays well under the proxy's 120 s; pages not reached by then are listed as not checked
const DEADLINE_MS = 75_000
const PAGE_TIMEOUT_MS = 8_000
const OUT_OF_TIME = 'Not checked: the audit ran out of time. Run it again to check this page.'

const sameHost = (url: string, origin: string) => {
    try {
        const strip = (h: string) => h.replace(/^www\./, '')
        return strip(new URL(url).hostname) === strip(new URL(origin).hostname)
    } catch {
        return false
    }
}

const locsIn = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'))

// A sitemap index lists more sitemaps (nested); a urlset lists pages, of which we keep product pages
export const productUrlsFromSitemap = (xml: string, origin: string): { products: string[]; nested: string[] } => {
    const locs = locsIn(xml).filter((u) => sameHost(u, origin))
    if (/<sitemapindex/i.test(xml)) return { products: [], nested: locs }
    return { products: locs.filter((u) => /\/products?\/[^/?#]+/.test(new URL(u).pathname)), nested: [] }
}

// Shopify's /collections.json, without the catch-all collections
export const collectionUrlsFromJson = (json: string, origin: string): string[] => {
    try {
        const list = (JSON.parse(json) as { collections?: Array<{ handle?: string }> }).collections
        if (!Array.isArray(list)) return []
        return list
            .map((c) => c.handle)
            .filter((h): h is string => !!h && h !== 'all' && h !== 'frontpage')
            .slice(0, COLLECTIONS)
            .map((h) => `${origin}/collections/${encodeURIComponent(h)}`)
    } catch {
        return []
    }
}

const linksIn = (html: string, origin: string, re: RegExp) => {
    const $ = cheerio.load(html)
    const out = new Set<string>()
    $('a[href]').each((_, el) => {
        try {
            const u = new URL($(el).attr('href') || '', origin)
            if (sameHost(u.href, origin) && re.test(u.pathname)) out.add(u.origin + u.pathname)
        } catch {
            // malformed href
        }
    })
    return [...out]
}

type FetchText = (url: string) => Promise<string>

// Saved products first (the brand chose them), else the sitemap, else the homepage's links
export const choosePages = async ({ origin, saved, max, fetchText }: { origin: string; saved: string[]; max: number; fetchText: FetchText }) => {
    const get = (url: string) => fetchText(url).catch(() => '')
    let homepage: Promise<string> | null = null
    const home = () => (homepage ??= get(origin))

    let source: 'products' | 'sitemap' | 'homepage' = 'products'
    let products = [...new Set(saved.filter((u) => sameHost(u, origin)))].slice(0, max)
    if (!products.length) {
        source = 'sitemap'
        const root = productUrlsFromSitemap(await get(`${origin}/sitemap.xml`), origin)
        products = root.products
        // Shopify: /sitemap.xml → /sitemap_products_1.xml; read the product sitemaps first
        // Only product sitemaps; other nested sitemaps (pages, blogs) can't list products
        const nested = root.nested.filter((u) => /product/i.test(u)).slice(0, 2)
        for (const url of nested) {
            if (products.length >= max) break
            products.push(...productUrlsFromSitemap(await get(url), origin).products)
        }
        products = [...new Set(products)].slice(0, max)
    }
    if (!products.length) {
        source = 'homepage'
        products = linksIn(await home(), origin, /\/products?\/[^/]+/).slice(0, max)
    }

    let collections = collectionUrlsFromJson(await get(`${origin}/collections.json`), origin)
    if (!collections.length) {
        collections = linksIn(await home(), origin, /^\/collections\/(?!all\/?$|frontpage\/?$)[^/]+\/?$/).slice(0, COLLECTIONS)
    }
    return { source, products, collections }
}

export interface IStoreAudit {
    checkedAt: Date
    source: 'products' | 'sitemap' | 'homepage'
    score: number | null
    pages: IStorePage[]
}

// Fetch and score every chosen page, two at a time; a page that fails gets an error row, the rest go on
export const runStoreAudit = async (
    website: string,
    saved: Array<{ url: string; shortName: string }>,
    max: number,
    fetchText?: FetchText,
    { deadlineMs = DEADLINE_MS, pageTimeoutMs = PAGE_TIMEOUT_MS }: { deadlineMs?: number; pageTimeoutMs?: number } = {}
): Promise<IStoreAudit> => {
    const deadline = Date.now() + deadlineMs
    const fetchPage: FetchText =
        fetchText ?? ((url) => fetchPublicText(url, { 'User-Agent': 'Mozilla/5.0 (compatible; SignalAI-StoreAudit/1.0)' }, pageTimeoutMs))
    // Every fetch also stops at the overall deadline
    const timeLeft = () => Math.max(deadline - Date.now(), 0)
    const bounded: FetchText = async (url) => {
        let timer: NodeJS.Timeout | undefined
        const outOfTime = new Promise<string>((_, reject) => {
            timer = setTimeout(() => reject(new Error(OUT_OF_TIME)), timeLeft())
        })
        try {
            return await Promise.race([fetchPage(url), outOfTime])
        } finally {
            clearTimeout(timer)
        }
    }
    const origin = new URL(auditService.cleanUrl(website)).origin
    const { source, products, collections } = await choosePages({ origin, saved: saved.map((s) => s.url), max, fetchText: bounded })
    const nameOf = new Map(saved.map((s) => [s.url, s.shortName]))
    const jobs = [...products.map((url) => ({ url, kind: 'product' as const })), ...collections.map((url) => ({ url, kind: 'collection' as const }))]

    const pages: IStorePage[] = new Array(jobs.length)
    let next = 0
    const worker = async () => {
        while (next < jobs.length) {
            const i = next++
            const { url, kind } = jobs[i]
            if (!timeLeft()) {
                pages[i] = { url, name: nameOf.get(url) || url, kind, score: null, level: null, checks: [], error: OUT_OF_TIME }
                continue
            }
            try {
                const html = await bounded(url)
                const shopify = isShopifyHtml(html)
                const page = kind === 'product' ? scoreProductPage(html, url, shopify) : scoreCollectionPage(html, url, shopify)
                pages[i] = { ...page, name: nameOf.get(url) || page.name }
            } catch (err) {
                pages[i] = {
                    url,
                    name: nameOf.get(url) || url,
                    kind,
                    score: null,
                    level: null,
                    checks: [],
                    error: (err as Error)?.message === OUT_OF_TIME ? OUT_OF_TIME : `Couldn't open this page: ${openError(err)}`
                }
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, jobs.length) }, worker))

    const scored = pages.filter((p) => p.kind === 'product' && p.score !== null)
    const score = scored.length ? Math.round(scored.reduce((sum, p) => sum + (p.score as number), 0) / scored.length) : null
    // Weakest product pages first, pages that failed after them, collections last
    const rank = (p: IStorePage) => (p.kind === 'collection' ? 2 : p.score === null ? 1 : 0)
    pages.sort((a, b) => rank(a) - rank(b) || (a.score ?? 0) - (b.score ?? 0))
    return { checkedAt: new Date(), source, score, pages }
}

// "https://www.store.com/products/x/?v=1" and "https://store.com/products/x" are the same page
const pageKey = (url: string) => {
    try {
        const u = new URL(url)
        return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase()
    } catch {
        return ''
    }
}

// A saved product's AI-readiness score from the latest store audit, for the Products page
export const aiReadyFor = (url: string, audit: IStoreAudit | null | undefined): number | null => {
    const key = pageKey(url)
    if (!key || !audit?.pages) return null
    return audit.pages.find((p) => p.kind === 'product' && pageKey(p.url) === key)?.score ?? null
}

// The store audit for a brand: its saved products (up to the plan's limit) or the store's own pages
export const storeAuditForBrand = async (brand: {
    _id: unknown
    website: string
    orgId: unknown
    products?: Array<{ url: string; shortName: string }>
}) => {
    const org = await orgModel.findById(brand.orgId).select('plan').lean()
    const { maxProducts } = getPlanLimits(((org as { plan?: string } | null)?.plan || 'free') as PlanName)
    const saved = (brand.products || []).filter((p) => p.url).map((p) => ({ url: p.url, shortName: p.shortName }))
    return runStoreAudit(brand.website, saved, maxProducts)
}
