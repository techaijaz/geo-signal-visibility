/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/aiView.check.ts
import assert from 'assert'
import { extractPageFacts, compareFacts } from '../service/aiViewService'

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
console.log('ai-view checks: PASS')
process.exit(0)
