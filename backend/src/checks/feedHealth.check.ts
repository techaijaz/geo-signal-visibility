/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/feedHealth.check.ts
import assert from 'assert'
import { scoreFeedProduct, summarizeFeed, feedScoreFor, runFeedHealth } from '../service/feedHealthService'

const O = 'https://hasanoud.com'
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
const product = (over: Record<string, unknown> = {}) => ({
    id: 1,
    title: 'Silk Oud Premium Alcohol Free Attar',
    handle: 'silk-oud',
    vendor: 'Hasan Oud',
    product_type: 'Attar',
    body_html: `<p>${words(60)}</p>`,
    images: [{ src: 'https://cdn.shopify.com/s/files/1/silk.jpg?v=1' }, { src: 'https://cdn.shopify.com/s/files/1/box.png' }],
    variants: [
        { price: '599.00', compare_at_price: '999.00', available: true },
        { price: '299.00', compare_at_price: null, available: false }
    ],
    ...over
})
const check = (p: ReturnType<typeof scoreFeedProduct>, key: string) => p!.checks.find((c) => c.key === key)!

const run = async () => {
    // A complete product: 100, green, every check passes, GTIN not checked
    const good = scoreFeedProduct(product(), O)!
    assert.equal(good.url, `${O}/products/silk-oud`)
    assert.equal(good.name, 'Silk Oud Premium Alcohol Free Attar')
    assert.equal(good.score, 100)
    assert.equal(good.level, 'good')
    assert.deepStrictEqual(
        good.checks.map((c) => [c.key, c.max]),
        [
            ['description', 25],
            ['title', 15],
            ['brand', 10],
            ['image', 10],
            ['images', 10],
            ['price', 10],
            ['stock', 10],
            ['category', 10],
            ['gtin', 0]
        ]
    )
    assert.deepStrictEqual([check(good, 'gtin').pass, check(good, 'gtin').detail], [null, 'Connect Shopify to check'])
    assert.ok(good.checks.filter((c) => c.pass !== null).every((c) => c.pass && !c.tip))

    // Each gap, with a Shopify fix
    const bad = scoreFeedProduct(
        product({
            title: 'OUD',
            handle: 'oud-bad',
            vendor: ' ',
            product_type: 'variable',
            body_html: '<img src="a.jpg"><p>Short   text</p>',
            images: [{ src: 'https://cdn.shopify.com/s/files/1/a.webp' }],
            variants: [{ price: '599.00', compare_at_price: '499.00', available: false }]
        }),
        O
    )!
    assert.equal(bad.score, 0)
    assert.equal(bad.level, 'bad')
    assert.equal(check(bad, 'description').detail, '2 words')
    assert.ok(bad.checks.filter((c) => c.pass === false).every((c) => c.tip && /Shopify|Products/.test(c.tip)))
    assert.match(check(bad, 'price').detail, /compare-at/i)
    // All capitals fails even at a normal length; 151 characters fails
    assert.equal(check(scoreFeedProduct(product({ title: 'SILK OUD PREMIUM ALCOHOL FREE ATTAR' }), O), 'title').pass, false)
    assert.equal(check(scoreFeedProduct(product({ title: 'x'.repeat(151) }), O), 'title').pass, false)
    // Price 0 fails; no compare-at passes
    assert.equal(check(scoreFeedProduct(product({ variants: [{ price: '0.00', available: true }] }), O), 'price').pass, false)
    assert.equal(check(scoreFeedProduct(product({ variants: [{ price: '599.00', available: true }] }), O), 'price').pass, true)
    // Compare-at equal to the price just means no discount: fine (93 of Hasan Oud's products)
    assert.equal(
        check(scoreFeedProduct(product({ variants: [{ price: '599.00', compare_at_price: '599.00', available: true }] }), O), 'price').pass,
        true
    )
    // Description over 5,000 characters fails; missing body_html, images and variants don't crash
    assert.equal(check(scoreFeedProduct(product({ body_html: `<p>${'longword '.repeat(700)}</p>` }), O), 'description').pass, false)
    const bare = scoreFeedProduct({ id: 2, title: 'Bare Product Name', handle: 'bare' }, O)!
    assert.equal(bare.score, 15)
    assert.equal(scoreFeedProduct({ title: 'no handle' }, O), null)
    assert.equal(scoreFeedProduct(null, O), null)

    // Store summary: average, failing counts sorted by count, GTIN not in the summary
    const many = [scoreFeedProduct(product(), O)!, bad, bare]
    const feed = summarizeFeed(many, true)
    assert.equal(feed.shopify, true)
    assert.equal(feed.total, 3)
    assert.equal(feed.score, Math.round((100 + 0 + 15) / 3))
    assert.ok(!feed.summary.some((s) => s.key === 'gtin'))
    assert.deepStrictEqual(feed.summary[0], { key: 'description', label: 'Description', failing: 2 })
    assert.ok(feed.summary.every((s, i, a) => i === 0 || a[i - 1].failing >= s.failing))
    assert.deepStrictEqual(
        feed.products.map((p) => p.score),
        [0, 15, 100]
    )
    assert.deepStrictEqual(summarizeFeed([], false), {
        ...summarizeFeed([], false),
        shopify: false,
        total: 0,
        score: null,
        summary: [],
        products: []
    })

    // 1000 products stay fast
    const t0 = Date.now()
    summarizeFeed(
        Array.from({ length: 1000 }, (_, i) => scoreFeedProduct(product({ handle: `p${i}` }), O)!),
        true
    )
    assert.ok(Date.now() - t0 < 2000, 'summary of 1000 products is quick')

    // Products page column: matched by URL
    assert.equal(feedScoreFor('https://www.hasanoud.com/products/silk-oud/?v=1', feed), 100)
    assert.equal(feedScoreFor(`${O}/products/none`, feed), null)
    assert.equal(feedScoreFor(`${O}/products/silk-oud`, null), null)

    // Run against a store: Shopify's products.json through the injected fetcher; not a store → shopify false
    const store = async (url: string) => {
        if (url.includes('products.json?limit=250&page=1')) return JSON.stringify({ products: [product(), product({ handle: 'two', vendor: '' })] })
        throw new Error('404')
    }
    const ran = await runFeedHealth('hasanoud.com', store)
    assert.deepStrictEqual([ran.shopify, ran.total], [true, 2])
    assert.equal(ran.products[0].url, `${O}/products/two`)
    const notStore = await runFeedHealth('https://example.com', async () => '<html>not json</html>')
    assert.deepStrictEqual([notStore.shopify, notStore.total, notStore.score], [false, 0, null])

    console.log('feed health checks: PASS')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
