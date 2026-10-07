// Store audit: how ready each product page (and a few collection pages) is for AI engines, with a fix for
// every gap. Scoring is pure; it reads the same facts as the AI Crawler View.
import * as cheerio from 'cheerio'
import { extractPageFacts } from './aiViewService'

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
    const altPoints = total ? Math.round((10 * withAlt) / total) : 10

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
            !total || withAlt / total >= 0.8,
            altPoints,
            10,
            total ? `${withAlt} of ${total} images have alt text` : 'No images',
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
