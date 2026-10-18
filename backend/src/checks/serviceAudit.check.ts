/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/serviceAudit.check.ts
import assert from 'assert'
import { faqIssueText, platformsIn, shouldRunProductChecks, listingsEmptyName } from '../service/auditService'
import { compareFacts, scorePage, extractPageFacts } from '../service/aiViewService'
import { siteProfile } from '../service/siteProfile'

const shop = siteProfile({ businessType: 'ecommerce' })
const svc = siteProfile({ businessType: 'service' })

assert.equal(faqIssueText(shop), 'FAQPage schema missing on homepage and product pages (Limits direct AI answers and search snippet citations)')
assert.equal(faqIssueText(svc), 'FAQPage schema missing on homepage and main pages (Limits direct AI answers and search snippet citations)')

// Product page audit and feed check only for sites that sell products (and only when the homepage opened)
assert.equal(shouldRunProductChecks(true, shop), true)
assert.equal(shouldRunProductChecks(false, shop), false)
assert.equal(shouldRunProductChecks(true, svc), false)
assert.equal(shouldRunProductChecks(true, siteProfile({ businessType: 'service', sellsProducts: true })), true)

// Directories count as listings; the old platforms still do
assert.deepEqual(platformsIn('https://www.justdial.com/Mumbai/Sabka-Dentist'), ['Justdial Listing'])
assert.deepEqual(platformsIn('https://www.practo.com/mumbai/clinic/sabka-dentist'), ['Practo Profile'])
assert.deepEqual(platformsIn('https://g.page/sabkadentist'), ['Google Business Profile'])
assert.deepEqual(platformsIn('https://maps.app.goo.gl/abc'), ['Google Business Profile'])
assert.deepEqual(platformsIn('https://www.google.com/maps/place/Sabka'), ['Google Business Profile'])
assert.deepEqual(platformsIn('https://www.capterra.com/p/1/x'), ['Capterra Profile'])
assert.deepEqual(platformsIn('https://www.amazon.in/stores/x'), ['Amazon Store'])
assert.deepEqual(platformsIn('https://www.g2.com/products/x'), ['G2 Directory Profile'])
assert.deepEqual(platformsIn('https://example.com/about'), [])
assert.equal(listingsEmptyName(shop), 'Marketplace & Sales Channels')
assert.equal(listingsEmptyName(svc), 'Listings & directories')

// AI crawler view: a site without products has no price, rating or Product schema rows
const html =
    '<html><head><title>Sabka Dentist</title><script type="application/ld+json">{"@type":"Dentist","name":"Sabka"}</script></head><body><h1>Sabka Dentist</h1></body></html>'
const f = extractPageFacts(html)
assert.deepEqual(
    compareFacts(f, f).map((r) => r.key),
    ['name', 'price', 'rating', 'description', 'schema']
)
const rows = compareFacts(f, f, false, false)
assert.deepEqual(
    rows.map((r) => r.key),
    ['name', 'description', 'schema']
)
assert.equal(rows[0].label, 'Name')
assert.equal(rows[2].label, 'Schema markup')
assert.equal(rows[2].ai, 'Found')
const s = scorePage(f, f, false)
assert.ok(s.total !== null && s.total <= 3)

console.log('serviceAudit checks: PASS')
process.exit(0)
