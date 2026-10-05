// What an AI crawler (raw HTML) and a shopper (after JavaScript) can read on a page
import * as cheerio from 'cheerio'
import { schemaTypesIn } from './auditService'

export interface IPageFacts {
    name: string | null
    price: string | null
    rating: string | null
    words: number
    images: { total: number; withAlt: number }
    schemaTypes: string[]
    preview: string
}

export interface IFactRow {
    key: 'name' | 'price' | 'rating' | 'description' | 'schema'
    label: string
    ai: string | null
    shopper: string | null
    missingForAi: boolean
}

type Json = Record<string, unknown>

// Every object in the page's JSON-LD, at any depth
const jsonLdNodes = ($: cheerio.CheerioAPI): Json[] => {
    const out: Json[] = []
    const walk = (n: unknown): void => {
        if (Array.isArray(n)) return n.forEach(walk)
        if (!n || typeof n !== 'object') return
        out.push(n as Json)
        Object.values(n).forEach(walk)
    }
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            walk(JSON.parse($(el).html() || '{}'))
        } catch {
            // invalid JSON-LD
        }
    })
    return out
}

const isType = (n: Json, t: string) => [n['@type']].flat().some((x) => typeof x === 'string' && x.toLowerCase() === t)

const formatPrice = (amount: string) => {
    const n = Number(amount.replace(/,/g, ''))
    return Number.isFinite(n) && n > 0 ? `₹${Math.round(n).toLocaleString('en-IN')}` : null
}

export const extractPageFacts = (html: string): IPageFacts => {
    const $ = cheerio.load(html)
    const nodes = jsonLdNodes($)
    const product = nodes.find((n) => isType(n, 'product'))
    const offer = nodes.find((n) => isType(n, 'offer') && n.price != null)
    const agg = nodes.find((n) => isType(n, 'aggregaterating'))

    $('script, style, noscript, template, svg').remove()
    const text = $('body').text().replace(/\s+/g, ' ').trim()

    const name =
        (typeof product?.name === 'string' && product.name.trim()) ||
        $('meta[property="og:title"]').attr('content')?.trim() ||
        $('h1').first().text().trim() ||
        $('title').text().trim() ||
        null

    const metaPrice = $('meta[property="product:price:amount"], meta[property="og:price:amount"]').attr('content')
    const textPrice = text.match(/(?:₹|Rs\.?|INR)\s?([\d,]+(?:\.\d+)?)/i)?.[1]
    const price = formatPrice(String(offer?.price ?? metaPrice ?? textPrice ?? ''))

    let rating: string | null = null
    if (agg?.ratingValue != null) {
        rating = `${agg.ratingValue}${agg.reviewCount != null ? ` (${agg.reviewCount} reviews)` : ''}`
    } else {
        const value = text.match(/(\d(?:\.\d)?)\s*(?:out of 5|\/\s*5|★|stars?)/i)?.[1]
        const count = text.match(/\(?(\d[\d,]*)\s+reviews?\)?/i)?.[1]
        if (value) rating = `${value}${count ? ` (${count} reviews)` : ''}`
    }

    const imgs = $('img')
    return {
        name,
        price,
        rating,
        words: text ? text.split(' ').length : 0,
        images: { total: imgs.length, withAlt: imgs.filter((_, el) => !!$(el).attr('alt')?.trim()).length },
        schemaTypes: schemaTypesIn(html),
        preview: text.slice(0, 300)
    }
}

export const compareFacts = (ai: IPageFacts, shopper: IPageFacts | null): IFactRow[] => {
    const row = (key: IFactRow['key'], label: string, a: string | null, s: string | null, missing: boolean): IFactRow => ({
        key,
        label,
        ai: a,
        shopper: shopper ? s : null,
        missingForAi: !!shopper && missing
    })
    const hasProduct = (f: IPageFacts) => (f.schemaTypes.includes('product') ? 'Found' : null)
    return [
        row('name', 'Product name', ai.name, shopper?.name ?? null, !ai.name && !!shopper?.name),
        row('price', 'Price', ai.price, shopper?.price ?? null, !ai.price && !!shopper?.price),
        row('rating', 'Rating & reviews', ai.rating, shopper?.rating ?? null, !ai.rating && !!shopper?.rating),
        row(
            'description',
            'Description',
            `${ai.words} words`,
            shopper ? `${shopper.words} words` : null,
            !!shopper && shopper.words >= 50 && ai.words < shopper.words / 2
        ),
        row('schema', 'Product schema', hasProduct(ai), shopper ? hasProduct(shopper) : null, !hasProduct(ai) && !!shopper && !!hasProduct(shopper))
    ]
}
