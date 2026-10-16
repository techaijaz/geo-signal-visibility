/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/fixGuide.check.ts
import assert from 'assert'
import { FIX_GUIDES, guideFor, kindFromText, kindForCheck, guidesFor, type FixKind } from '../service/fixGuide'

const HINGLISH = /\b(ke|ki|ka|hai|hain|liye|kaise|kya|aur|nahi|karein|apna|apne)\b/i
for (const [kind, g] of Object.entries(FIX_GUIDES)) {
    assert.equal(g.kind, kind)
    assert.ok(g.who === 'you' || g.who === 'developer', kind)
    assert.ok(g.title.length >= 5 && g.title.length <= 60, `${kind} title`)
    for (const list of [g.steps.shopify, g.steps.other]) {
        assert.ok(list.length >= 3 && list.length <= 6, `${kind} steps count`)
        for (const s of list) assert.ok(s.length >= 10 && s.length <= 220, `${kind} step length: ${s}`)
    }
    assert.ok(g.forDeveloper.length >= 20, `${kind} developer note`)
    const all = [g.title, g.forDeveloper, ...g.steps.shopify, ...g.steps.other].join(' ')
    assert.ok(!HINGLISH.test(all), `${kind} has Hinglish: ${all.match(HINGLISH)?.[0]}`)
}
// who split from the spec
const you: FixKind[] = [
    'reviews',
    'description',
    'alt-text',
    'title-meta',
    'price-stock',
    'product-ids',
    'images',
    'faq-page',
    'comparison-page',
    'marketplace',
    'outreach',
    'forums'
]
for (const k of you) assert.equal(FIX_GUIDES[k].who, 'you', k)
for (const k of [
    'crawler-access',
    'llms-txt',
    'product-schema',
    'faq-schema',
    'rating-schema',
    'js-content',
    'collection-schema',
    'other'
] as FixKind[])
    assert.equal(FIX_GUIDES[k].who, 'developer', k)

// guideFor falls back to other
assert.equal(guideFor('nope').kind, 'other')
assert.equal(guideFor(undefined).kind, 'other')
assert.equal(guideFor('faq-page').kind, 'faq-page')
// Object property names are not kinds
assert.equal(guideFor('constructor').kind, 'other')
assert.equal(guideFor('__proto__').kind, 'other')
assert.equal(kindForCheck('feed', 'toString'), 'other')

// kindFromText: the built-in recommendation texts and typical AI texts
const cases: Array<[string, FixKind]> = [
    ['Unblock Google-Extended in robots.txt so Gemini can crawl Hasan Oud', 'crawler-access'],
    ['Publish an llms.txt with a clear, structured summary of what Hasan Oud sells', 'llms-txt'],
    ['Add FAQPage schema to your top 10 product pages for Hasan Oud', 'faq-schema'],
    ['Publish a direct "Hasan Oud vs. Ajmal" comparison page', 'comparison-page'],
    ['Collect 20+ verified customer reviews for Hasan Oud on Google', 'reviews'],
    ['Build a genuine presence in relevant Fragrances subreddits & online forums', 'forums'],
    ['Create an FAQ page answering "is attar alcohol free"', 'faq-page'],
    ['List your bestsellers on Amazon.in and Nykaa', 'marketplace'],
    ['Get featured in fragrance blogs that list the best attars', 'outreach'],
    ['Add descriptive alt text to every product image', 'alt-text'],
    ['Expand product descriptions to 150+ words', 'description'],
    ['Add Product JSON-LD schema with offers and brand', 'product-schema'],
    ['Something we have never seen before', 'other']
]
for (const [text, kind] of cases) assert.equal(kindFromText(text), kind, text)

// every audit / view / feed key maps to a kind
for (const k of ['schema', 'price', 'reviews', 'description', 'faq', 'alt', 'meta']) assert.notEqual(kindForCheck('store-audit', k), 'other', k)
for (const k of ['schema', 'description', 'meta']) assert.notEqual(kindForCheck('collection', k), 'other', k)
for (const k of ['name', 'price', 'rating', 'description', 'schema']) assert.notEqual(kindForCheck('ai-view', k), 'other', k)
for (const k of ['description', 'title', 'brand', 'image', 'images', 'price', 'stock', 'category', 'gtin'])
    assert.notEqual(kindForCheck('feed', k), 'other', k)
assert.equal(kindForCheck('feed', 'unknown-key'), 'other')

// guidesFor returns each needed guide once, unknowns as other
const g = guidesFor(['reviews', undefined, 'reviews', 'xyz'])
assert.deepEqual(Object.keys(g).sort(), ['other', 'reviews'])

console.log('fixGuide checks: PASS')
process.exit(0)
