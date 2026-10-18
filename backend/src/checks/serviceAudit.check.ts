/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/serviceAudit.check.ts
import assert from 'assert'
import { entitySchemaLabel, faqIssueText, hasEntitySchema, platformsIn, shouldRunProductChecks, listingsEmptyName } from '../service/auditService'
import { compareFacts, scorePage, extractPageFacts, viewForProfile, viewMatches } from '../service/aiViewService'
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

// LocalBusiness and its subtypes count as the business schema, so a clinic with Dentist schema is not told to add it
const local = siteProfile({ businessType: 'local_business' })
assert.equal(hasEntitySchema(['dentist'], svc), true)
assert.equal(hasEntitySchema(['localbusiness'], local), true)
assert.equal(hasEntitySchema(['medicalclinic'], svc), true)
assert.equal(hasEntitySchema(['professionalservice'], svc), true)
assert.equal(hasEntitySchema(['website', 'organization'], svc), false)
// A stray Product schema is not a business schema for a service site
assert.equal(hasEntitySchema(['product'], svc), false)
// Shops: as before
assert.equal(hasEntitySchema(['product'], shop), true)
assert.equal(hasEntitySchema(['website'], shop), false)
// One label per type, also on the rows shown when the site can't be read
assert.equal(entitySchemaLabel(shop), 'Product / Brand schema')
assert.equal(entitySchemaLabel(svc), 'Service / ProfessionalService schema')
assert.equal(entitySchemaLabel(local), 'LocalBusiness schema')
assert.equal(entitySchemaLabel(siteProfile({ businessType: 'saas' })), 'SoftwareApplication schema')

// A view saved while the brand was a shop: shown without product rows or the product page, and not reused as the cache
const oldView = {
    checkedAt: new Date(),
    pages: [
        { url: 'https://x.com/products/a', label: 'Product page' as const, rows: compareFacts(f, f), aiPreview: '' },
        { url: 'https://x.com', label: 'Homepage' as const, rows: compareFacts(f, f), aiPreview: '' }
    ]
}
assert.equal(viewMatches(oldView, true), true)
assert.equal(viewMatches(oldView, false), false)
const shown = viewForProfile(oldView, false)
assert.deepEqual(
    shown.pages.map((p) => p.label),
    ['Homepage']
)
assert.deepEqual(
    shown.pages[0].rows.map((r) => r.key),
    ['name', 'description']
)
assert.equal(shown.pages[0].rows[0].label, 'Name')
assert.equal(viewForProfile(oldView, true), oldView)
// A view made for a site without products matches it; an errored view (no rows) matches anything
const newView = { checkedAt: new Date(), pages: [{ url: 'https://x.com', label: 'Homepage' as const, rows: rows, aiPreview: '' }] }
assert.equal(viewMatches(newView, false), true)
assert.equal(viewMatches(newView, true), false)
assert.equal(
    viewMatches({ checkedAt: new Date(), pages: [{ url: 'https://x.com', label: 'Homepage' as const, rows: [], aiPreview: '', error: 'x' }] }, false),
    true
)

console.log('serviceAudit checks: PASS')
process.exit(0)
