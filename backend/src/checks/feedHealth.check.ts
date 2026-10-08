/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/feedHealth.check.ts
import assert from 'assert'
import { scoreFeedProduct, summarizeFeed, feedScoreFor, feedScores, keepSavedFeed, runFeedHealth } from '../service/feedHealthService'

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
    assert.ok(good.checks.filter((c) => c.pass !== null).every((c) => c.pass))

    // Each gap
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
    assert.equal(bad.checks.filter((c) => c.pass === false).length, 8)
    assert.ok(
        bad.checks.every((c) => !('tip' in c)),
        'tips live in the app, not in every saved product'
    )
    // Only images and HTML, no text: 0 words
    assert.equal(check(scoreFeedProduct(product({ body_html: '<img src="a.jpg"><div><br></div>' }), O), 'description').detail, '0 words')
    // "don&rsquo;t" is one word
    assert.equal(check(scoreFeedProduct(product({ body_html: '<p>don&rsquo;t stop&nbsp;now</p>' }), O), 'description').detail, '3 words')
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
        products: [],
        truncated: false,
        partial: false
    })

    // 1000 products stay fast
    const t0 = Date.now()
    summarizeFeed(
        Array.from({ length: 1000 }, (_, i) => scoreFeedProduct(product({ handle: `p${i}` }), O)!),
        true
    )
    assert.ok(Date.now() - t0 < 2000, 'summary of 1000 products is quick')

    // Products page column: matched by URL
    const scores = feedScores(feed)
    assert.equal(feedScoreFor('https://www.hasanoud.com/products/silk-oud/?v=1', scores), 100)
    assert.equal(feedScoreFor(`${O}/products/none`, scores), null)
    assert.equal(feedScoreFor(`${O}/products/silk-oud`, feedScores(null)), null)

    // A store blip never replaces a good saved result; a real result or a first result is saved
    const ok = { shopify: true, partial: false }
    assert.equal(keepSavedFeed({ shopify: true }, { shopify: false, partial: false }), true)
    assert.equal(keepSavedFeed({ shopify: true }, { shopify: true, partial: true }), true)
    assert.equal(keepSavedFeed({ shopify: true }, ok), false)
    assert.equal(keepSavedFeed({ shopify: false }, { shopify: false, partial: false }), false)
    assert.equal(keepSavedFeed(null, { shopify: false, partial: false }), false)
    assert.equal(keepSavedFeed(undefined, { shopify: true, partial: true }), false)

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
    // Page 2 fails → partial; page 2 empty → complete; 4 full pages → truncated at 1000
    const full = (n: number) => JSON.stringify({ products: Array.from({ length: 250 }, (_, i) => product({ handle: `p${n}-${i}` })) })
    const failsOnTwo = await runFeedHealth('hasanoud.com', async (u) => {
        if (u.includes('page=1')) return full(1)
        throw new Error('timeout')
    })
    assert.deepStrictEqual([failsOnTwo.shopify, failsOnTwo.total, failsOnTwo.partial, failsOnTwo.truncated], [true, 250, true, false])
    const emptyTwo = await runFeedHealth('hasanoud.com', async (u) => (u.includes('page=1') ? full(1) : '{"products": []}'))
    assert.deepStrictEqual([emptyTwo.total, emptyTwo.partial], [250, false])
    const big = await runFeedHealth('hasanoud.com', async (u) => full(Number(/page=(\d)/.exec(u)![1])))
    assert.deepStrictEqual([big.total, big.truncated, big.partial], [1000, true, false])
    assert.ok(JSON.stringify(big).length < 1_200_000, `1000 products saved size ${JSON.stringify(big).length}`)
    console.log(`  saved size for 1000 products: ${Math.round(JSON.stringify(big).length / 1024)} KB`)

    console.log('feed health checks: PASS')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
