/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/storeAudit.check.ts
import assert from 'assert'
import {
    scoreProductPage,
    scoreCollectionPage,
    productUrlsFromSitemap,
    collectionUrlsFromJson,
    choosePages,
    runStoreAudit
} from '../service/storeAuditService'

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
const jsonLd = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`

const goodPage = `<html><head><title>Silk Oud Attar 12ml | Hasan Oud</title>
<meta name="description" content="${'Silk Oud is a rich long lasting alcohol free attar for daily wear. '.repeat(2)}">
${jsonLd({
    '@context': 'https://schema.org',
    '@graph': [
        {
            '@type': 'Product',
            name: 'Silk Oud',
            offers: [{ '@type': 'Offer', price: '599.00', priceCurrency: 'INR' }],
            aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', reviewCount: '96' }
        },
        { '@type': 'FAQPage', mainEntity: [] }
    ]
})}</head><body><main><h1>Silk Oud</h1><p>${words(60)}</p>
<img src="a.jpg" alt="Silk Oud bottle"><img src="b.jpg" alt="Box"><img src="c.jpg" alt="Label"><img src="d.jpg" alt="In hand"></main></body></html>`

const run = async () => {
    const good = scoreProductPage(goodPage, 'https://hasanoud.com/products/silk-oud', true)
    assert.equal(good.kind, 'product')
    assert.equal(good.name, 'Silk Oud')
    assert.equal(good.score, 100)
    assert.equal(good.level, 'good')
    assert.ok(good.checks.every((c) => c.pass && !c.tip))
    assert.deepStrictEqual(
        good.checks.map((c) => [c.key, c.max]),
        [
            ['schema', 25],
            ['price', 20],
            ['reviews', 15],
            ['description', 15],
            ['faq', 10],
            ['alt', 10],
            ['meta', 5]
        ]
    )

    // A JavaScript shell: almost nothing for AI, and a fix for every gap
    const shell = scoreProductPage(
        '<html><head><title>Shop</title></head><body><div id="root"></div></body></html>',
        'https://x.com/products/a',
        false
    )
    assert.ok((shell.score as number) <= 15, `shell score ${shell.score}`)
    assert.equal(shell.level, 'bad')
    assert.ok(shell.checks.filter((c) => !c.pass).every((c) => c.tip && c.tip.length > 20))
    assert.ok(!shell.checks.find((c) => c.key === 'schema')?.tip?.includes('Shopify'))
    assert.ok(
        scoreProductPage('<html><body></body></html>', 'https://x.com/p', true)
            .checks.find((c) => c.key === 'schema')
            ?.tip?.includes('Shopify')
    )

    // Alt text: partial points, pass from 80%
    const imgs = (withAlt: number, total: number) =>
        Array.from({ length: total }, (_, i) => (i < withAlt ? `<img src="${i}.jpg" alt="p${i}">` : `<img src="${i}.jpg" alt="">`)).join('')
    const alt38 = scoreProductPage(`<html><body><main>${imgs(3, 8)}</main></body></html>`, 'https://x.com/p', false).checks.find(
        (c) => c.key === 'alt'
    )!
    assert.deepStrictEqual([alt38.points, alt38.pass, alt38.detail], [4, false, '3 of 8 images have alt text'])
    const noImg = scoreProductPage('<html><body><main>text</main></body></html>', 'https://x.com/p', false).checks.find((c) => c.key === 'alt')!
    assert.deepStrictEqual([noImg.points, noImg.pass, noImg.detail], [10, true, 'No images'])

    // Price only in the text (non-zero) counts; a cart's Rs. 0.00 does not
    const textPrice = scoreProductPage('<html><body><main>Subtotal Rs. 0.00 <span>Rs. 1,299</span></main></body></html>', 'https://x.com/p', false)
    assert.equal(textPrice.checks.find((c) => c.key === 'price')?.pass, true)
    const zero = scoreProductPage('<html><body><main>Subtotal Rs. 0.00</main></body></html>', 'https://x.com/p', false)
    assert.equal(zero.checks.find((c) => c.key === 'price')?.pass, false)

    // FAQ written on the page: two question headings
    const faq = scoreProductPage(
        '<html><body><main><h3>Is it alcohol free?</h3><p>Yes.</p><h3>How long does it last?</h3><p>8 hours.</p></main></body></html>',
        'https://x.com/p',
        false
    )
    assert.equal(faq.checks.find((c) => c.key === 'faq')?.pass, true)

    // Title and meta lengths
    const meta = (title: string, desc: string) =>
        scoreProductPage(
            `<html><head><title>${title}</title><meta name="description" content="${desc}"></head><body></body></html>`,
            'https://x.com/p',
            false
        ).checks.find((c) => c.key === 'meta')!
    assert.equal(meta('Silk Oud Attar | Hasan Oud', 'A'.repeat(80)).pass, true)
    assert.equal(meta('Oud', 'A'.repeat(80)).pass, false)
    assert.equal(meta('Silk Oud Attar | Hasan Oud', 'short').pass, false)

    // Collections: three checks, no score
    const col = scoreCollectionPage(
        `<html><head><title>Oud Attars | Hasan Oud</title><meta name="description" content="${'All our oud attars in one place for you. '.repeat(2)}">${jsonLd({ '@type': 'CollectionPage', name: 'Oud Attars' })}</head><body><main><h1>Oud Attars</h1><p>${words(40)}</p></main></body></html>`,
        'https://hasanoud.com/collections/oud',
        true
    )
    assert.equal(col.kind, 'collection')
    assert.equal(col.score, null)
    assert.deepStrictEqual(
        col.checks.map((c) => [c.key, c.pass]),
        [
            ['schema', true],
            ['description', true],
            ['meta', true]
        ]
    )

    // ---- Which pages ----
    const O = 'https://shop.example'
    const index = `<?xml version="1.0"?><sitemapindex><sitemap><loc>${O}/sitemap_pages_1.xml</loc></sitemap><sitemap><loc>${O}/sitemap_products_1.xml?from=1</loc></sitemap><sitemap><loc>https://evil.example/sitemap_products_9.xml</loc></sitemap></sitemapindex>`
    assert.deepStrictEqual(productUrlsFromSitemap(index, O), {
        products: [],
        nested: [`${O}/sitemap_pages_1.xml`, `${O}/sitemap_products_1.xml?from=1`]
    })
    const urlset = `<urlset><url><loc>${O}/products/silk-oud</loc></url><url><loc>${O}/pages/about</loc></url><url><loc>${O}/products/vibe</loc></url><url><loc>https://other.example/products/x</loc></url></urlset>`
    assert.deepStrictEqual(productUrlsFromSitemap(urlset, O).products, [`${O}/products/silk-oud`, `${O}/products/vibe`])
    assert.deepStrictEqual(productUrlsFromSitemap('not xml', O), { products: [], nested: [] })

    const cols = JSON.stringify({ collections: ['all', 'frontpage', 'oud', 'attars', 'gifts', 'new', 'sale', 'extra'].map((handle) => ({ handle })) })
    assert.deepStrictEqual(
        collectionUrlsFromJson(cols, O),
        ['oud', 'attars', 'gifts', 'new', 'sale'].map((h) => `${O}/collections/${h}`)
    )
    assert.deepStrictEqual(collectionUrlsFromJson('<html>', O), [])

    // A stub store: sitemap index → product sitemap; collections.json; homepage links
    const homepage = `<html><body><a href="/products/a">A</a><a href="/products/b">B</a><a href="/collections/oud">Oud</a><a href="/collections/all">All</a></body></html>`
    const store: Record<string, string> = {
        [`${O}/sitemap.xml`]: index,
        [`${O}/sitemap_products_1.xml?from=1`]: urlset,
        [`${O}/collections.json`]: cols,
        [`${O}/`]: homepage,
        [O]: homepage
    }
    const asked: string[] = []
    const fetchStore = async (url: string) => {
        asked.push(url)
        if (url in store) return store[url]
        throw new Error('404')
    }

    // Saved products first (only on the store's own host), up to the plan limit
    const fromSaved = await choosePages({
        origin: O,
        saved: [`${O}/products/x`, 'https://amazon.in/dp/123', `https://www.shop.example/products/y`, `${O}/products/z`],
        max: 2,
        fetchText: fetchStore
    })
    assert.equal(fromSaved.source, 'products')
    assert.deepStrictEqual(fromSaved.products, [`${O}/products/x`, 'https://www.shop.example/products/y'])
    assert.equal(fromSaved.collections.length, 5)
    // No saved products: the sitemap
    const fromSitemap = await choosePages({ origin: O, saved: [], max: 10, fetchText: fetchStore })
    assert.deepStrictEqual([fromSitemap.source, fromSitemap.products], ['sitemap', [`${O}/products/silk-oud`, `${O}/products/vibe`]])
    // No sitemap and no collections.json: homepage links for both
    const bare = async (url: string) => {
        if (url === O || url === `${O}/`) return homepage
        throw new Error('404')
    }
    const fromHome = await choosePages({ origin: O, saved: [], max: 10, fetchText: bare })
    assert.deepStrictEqual(
        [fromHome.source, fromHome.products, fromHome.collections],
        ['homepage', [`${O}/products/a`, `${O}/products/b`], [`${O}/collections/oud`]]
    )

    // Run: two pages at a time, a failing page does not stop the rest, weakest first, average score
    const pagesHtml: Record<string, string> = {
        [`${O}/products/x`]: goodPage,
        [`${O}/products/y`]: '<html><head><title>Shop</title></head><body><div id="root"></div></body></html>',
        [`${O}/collections/oud`]: '<html><body><main>Oud</main></body></html>'
    }
    let inFlight = 0
    let maxInFlight = 0
    const fetchRun = async (url: string) => {
        if (url.endsWith('collections.json') || url.endsWith('sitemap.xml')) throw new Error('404')
        if (url === O || url === `${O}/`) return '<html><body><a href="/collections/oud">Oud</a></body></html>'
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((r) => setTimeout(r, 20))
        inFlight--
        if (url.endsWith('/products/broken')) throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
        return pagesHtml[url] ?? '<html></html>'
    }
    const audit = await runStoreAudit(
        O,
        [
            { url: `${O}/products/x`, shortName: 'Silk Oud' },
            { url: `${O}/products/y`, shortName: 'Vibe' },
            { url: `${O}/products/broken`, shortName: 'Broken' }
        ],
        10,
        fetchRun
    )
    assert.ok(maxInFlight <= 2, `ran ${maxInFlight} at once`)
    assert.equal(audit.source, 'products')
    const products = audit.pages.filter((p) => p.kind === 'product')
    assert.deepStrictEqual(
        products.map((p) => p.name),
        ['Vibe', 'Silk Oud', 'Broken']
    )
    assert.match(products[2].error || '', /could not be found/)
    assert.equal(audit.score, Math.round((100 + (products[0].score as number)) / 2))
    assert.deepStrictEqual(
        audit.pages.filter((p) => p.kind === 'collection').map((p) => p.url),
        [`${O}/collections/oud`]
    )
    assert.ok(audit.checkedAt instanceof Date)

    console.log('store audit checks: PASS')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
