/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/aiView.check.ts
import assert from 'assert'
import { extractPageFacts, compareFacts, fixTipFor, isShopifyHtml, scorePage } from '../service/aiViewService'

const spaRaw = '<html><head><title>Silk Oud | Shop</title></head><body><div id="root"></div><script>render()</script></body></html>'
const spaRendered = `<html><head><title>Silk Oud | Shop</title></head><body><div id="root"><h1>Silk Oud Attar</h1>
<p>${'Rich long lasting alcohol free oud attar for daily wear. '.repeat(12)}</p>
<span class="price">Rs. 1,299.00</span><div>4.7 out of 5 (212 reviews)</div>
<img src="a.jpg" alt="Silk Oud bottle"><img src="b.jpg"></div></body></html>`
const shopify = `<html><head><meta property="og:title" content="Amber Rose"><script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Amber Rose Attar","offers":[{"@type":"Offer","price":"549.00","priceCurrency":"INR"}],
"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.8","reviewCount":"96"}}]}</script></head>
<body><h1>Amber Rose</h1><p>${'Soft rose and amber attar. '.repeat(30)}</p><span>₹549</span></body></html>`

const raw = extractPageFacts(spaRaw)
const rendered = extractPageFacts(spaRendered)
assert.equal(raw.price, null)
assert.equal(raw.rating, null)
assert.equal(raw.name, 'Silk Oud | Shop')
assert.equal(rendered.name, 'Silk Oud Attar')
assert.equal(rendered.price, '₹1,299')
assert.equal(rendered.rating, '4.7 (212 reviews)')
assert.deepStrictEqual(rendered.images, { total: 2, withAlt: 1 })
assert.ok(rendered.words > 100)
assert.ok(rendered.preview.length <= 300)

const rows = compareFacts(raw, rendered)
const missing = rows.filter((r) => r.missingForAi).map((r) => r.key)
assert.deepStrictEqual(missing, ['price', 'rating', 'description'])

const s = extractPageFacts(shopify)
assert.equal(s.name, 'Amber Rose Attar')
assert.equal(s.price, '₹549')
assert.equal(s.rating, '4.8 (96 reviews)')
assert.ok(s.schemaTypes.includes('product'))
assert.deepStrictEqual(
    compareFacts(s, s).filter((r) => r.missingForAi),
    []
)

// Chrome failed: nothing can be marked missing
assert.deepStrictEqual(
    compareFacts(raw, null).filter((r) => r.missingForAi),
    []
)
// Preview skips header, nav, cart and footer chrome and starts at the main content
const chrome = extractPageFacts(
    '<body><header><a>Skip to content</a> Your cart is empty</header><nav>Shop Men Women</nav><main><h1>Silk Oud</h1><p>Rich oud attar.</p></main><footer>Contact us</footer></body>'
)
assert.ok(chrome.preview.startsWith('Silk Oud'), chrome.preview)
// Summary score: facts the shopper sees, and how many of them the AI sees too
assert.deepStrictEqual(scorePage(raw, rendered), { seen: 1, total: 4, level: 'bad' })
assert.deepStrictEqual(scorePage(s, s), { seen: 5, total: 5, level: 'good' })
const noRating = extractPageFacts(shopify.replace(/"aggregateRating"[^}]*\},?/, '').replace('"priceCurrency":"INR"}],', '"priceCurrency":"INR"}]'))
assert.equal(noRating.rating, null)
assert.deepStrictEqual(scorePage(noRating, s), { seen: 4, total: 5, level: 'warn' })
// A fact the shopper doesn't have isn't counted, even when the AI has it
assert.deepStrictEqual(scorePage(s, noRating), { seen: 4, total: 4, level: 'good' })
// Shopper view failed: only what the AI sees, no total
assert.deepStrictEqual(scorePage(s, null), { seen: 5, total: null, level: null })
assert.deepStrictEqual(scorePage(raw, null), { seen: 1, total: null, level: null })
// Shopper page with nothing to count: no badge
const empty = extractPageFacts('<html><body></body></html>')
assert.deepStrictEqual(scorePage(empty, empty), { seen: 0, total: 0, level: null })

// Fix tips: one per fact, only on rows missing for the AI, Shopify wording on Shopify stores
for (const key of ['name', 'price', 'rating', 'description', 'schema'] as const) {
    assert.ok(fixTipFor(key).length > 20, key)
    assert.ok(fixTipFor(key, true).length >= fixTipFor(key).length, key)
}
assert.match(fixTipFor('price'), /Product schema/)
assert.match(fixTipFor('rating'), /AggregateRating/)
assert.match(fixTipFor('schema', true), /Shopify/)
assert.doesNotMatch(fixTipFor('schema'), /Shopify/)
const tipped = compareFacts(raw, rendered)
assert.deepStrictEqual(
    tipped.filter((r) => r.tip).map((r) => r.key),
    ['price', 'rating', 'description']
)
assert.equal(tipped.find((r) => r.key === 'price')?.tip, fixTipFor('price'))
assert.equal(compareFacts(raw, rendered, true).find((r) => r.key === 'rating')?.tip, fixTipFor('rating', true))
assert.ok(isShopifyHtml('<script src="//cdn.shopify.com/s/files/1/theme.js"></script>'))
assert.ok(!isShopifyHtml(spaRaw))
console.log('ai-view checks: PASS')
process.exit(0)
