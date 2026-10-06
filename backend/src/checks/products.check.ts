/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/products.check.ts
import assert from 'assert'
import {
    ruleShortName,
    cleanProductList,
    validateAiShortName,
    mergeRefresh,
    computeProductVisibility,
    isGenericName,
    suggestProductQuestions,
    fetchShopifyProducts,
    aiShortNames
} from '../service/productService'
import aiService from '../service/aiService'
import { PLAN_LIMITS } from '../config/planLimits'

const run = async () => {
    // Plan limits
    assert.deepStrictEqual(
        [PLAN_LIMITS.free.maxProducts, PLAN_LIMITS.starter.maxProducts, PLAN_LIMITS.growth.maxProducts, PLAN_LIMITS.agency.maxProducts],
        [3, 10, 25, 50]
    )

    // Rule names on real Hasan Oud titles
    const B = 'Hasan Oud'
    assert.equal(ruleShortName('Silk oud Special Powerful Sweet Arabic Attar Sample 1 ml', B), 'Silk Oud')
    assert.equal(ruleShortName('Passion Oud Strong FruIty Oud Attar by Hasanoud', B), 'Passion Oud')
    assert.equal(ruleShortName('VIBE Long Lasting Fresh Aromatic Perfume By Hasan Oud', B), 'Vibe')
    assert.equal(ruleShortName('Amber Rose Premium fragrances By Hasan Oud Alcohol Free Attar', B), 'Amber Rose')
    assert.equal(ruleShortName('The Blue Premium fragrances By Hasan Oud Alcohol Free Attar', B), 'Blue')
    assert.equal(ruleShortName('Oud Sample Attar Set by HASANOUD', B), 'Oud')
    assert.equal(ruleShortName('Alpha Signature Scent By Hasan Oud', B), 'Alpha Signature')
    assert.equal(ruleShortName('🎁 Hasan Oud Classic Vegan Leather Bag - Deep Olive', B), 'Classic Vegan Leather')

    // Junk is hidden; a sample and the full-size product share a name, only the full size stays visible
    const p = (id: number, title: string, price: string, handle = 'h' + id) => ({
        id,
        title,
        handle,
        product_type: '',
        variants: [{ price }],
        images: [{ src: `https://cdn/x${id}.jpg` }]
    })
    const list = cleanProductList(
        [
            p(1, 'Silk oud Special Powerful Sweet Arabic Attar Sample 1 ml', '199.00'),
            p(2, 'Silk Oud Premium Fragrances By Hasan Oud Alcohol Free Attar', '599.00', 'silk-oud'),
            p(3, '🎁 Hasan Oud Classic Vegan Leather Bag - Maroon', '0.00'),
            p(4, 'Unforgettable Gift Packaging', '599.00'),
            p(5, 'Silk Oud Attar by Hasanoud', '399.00'),
            p(6, 'Passion Oud Strong FruIty Oud Attar by Hasanoud', '599.00')
        ],
        B,
        'https://hasanoud.com'
    )
    const visible = list.filter((c) => !c.hidden)
    assert.deepStrictEqual(
        visible.map((c) => [c.shortName, c.price]),
        [
            ['Silk Oud', 599],
            ['Passion Oud', 599]
        ]
    )
    assert.deepStrictEqual(
        list
            .filter((c) => c.hidden)
            .map((c) => c.hiddenReason)
            .sort(),
        ['duplicate', 'free', 'gift', 'sample']
    )
    const silk = visible[0]
    assert.equal(silk.url, 'https://hasanoud.com/products/silk-oud')
    assert.equal(silk.shopifyId, '2')
    assert.equal(silk.image, 'https://cdn/x2.jpg')
    assert.deepStrictEqual(cleanProductList('nope' as never, B, 'https://x.com'), [])

    // AI names: kept only when short, made of title words and free of the brand
    const T = 'Passion Oud Strong FruIty Oud Attar by Hasanoud'
    assert.equal(validateAiShortName('Passion Oud', T, B), 'Passion Oud')
    assert.equal(validateAiShortName(' "Passion Oud" ', T, B), 'Passion Oud')
    assert.equal(validateAiShortName('Passion Musk', T, B), null) // word not in the title
    assert.equal(validateAiShortName('Hasanoud Passion', T, B), null) // brand
    assert.equal(validateAiShortName('Passion Oud Strong Fruity Oud', T, B), null) // 5 words
    assert.equal(validateAiShortName(42, T, B), null)

    // Refresh keeps a name the user edited, updates price/url/image/title
    const saved = [
        { ...silk, shortName: 'Silk Oud Attar', nameEditedByUser: true, price: 499 },
        { ...visible[1], price: 500 },
        {
            shopifyId: null,
            title: 'Manual',
            shortName: 'Manual',
            aliases: [],
            url: '',
            price: null,
            image: '',
            productType: '',
            nameEditedByUser: true
        }
    ]
    const merged = mergeRefresh(saved, list)
    assert.deepStrictEqual(
        merged.map((m) => [m.shortName, m.price]),
        [
            ['Silk Oud Attar', 599],
            ['Passion Oud', 599],
            ['Manual', null]
        ]
    )

    // Matching and counting
    const prod = (shortName: string, extra: Partial<Record<string, unknown>> = {}) => ({
        shopifyId: null,
        title: shortName,
        shortName,
        aliases: [],
        url: '',
        price: 599,
        image: '',
        productType: '',
        nameEditedByUser: false,
        ...extra
    })
    const m = (queryText: string, model: string, rawText: string) =>
        ({ queryText, model, rawText, mentioned: /hasan\s*oud/i.test(rawText), position: null }) as never
    const current = [
        m('q1', 'ChatGPT', 'Top picks:\n**1. Hasan Oud Silk Oud** - sweet\n2. Ajmal Amber Wood'),
        m('q1', 'Gemini', 'Try Silk Oud by Hasan Oud or Passion Oud.'),
        m('q2', 'ChatGPT', '1. Swiss Arabian Silk Oud\n2. Ajmal'), // no Hasan Oud: someone else's Silk Oud
        m('q2', 'Claude', 'Hasan Oud makes good oud attars.'), // "Oud" alone must not match anything
        m('q3', 'ChatGPT', '')
    ]
    const previous = [m('q1', 'ChatGPT', 'Hasan Oud Silk Oud is nice')]
    const products = [prod('Silk Oud'), prod('Passion Oud'), prod('Oud'), prod('Black Oud'), prod('Vibe')] as never[]
    const v = computeProductVisibility(current, previous, 'Hasan Oud', products, 4)
    assert.equal(v.totalAnswers, 5)
    assert.equal(v.textAvailable, true)
    assert.equal(v.counted, 4)
    const row = (n: string) => v.products.find((r) => r.shortName === n)!
    assert.equal(row('Silk Oud').answers, 2)
    assert.equal(row('Silk Oud').bestPosition, 1)
    assert.deepStrictEqual(row('Silk Oud').models, ['ChatGPT', 'Gemini'])
    assert.equal(row('Silk Oud').previousAnswers, 1)
    assert.equal(row('Silk Oud').hits[0].line, '1. Hasan Oud Silk Oud - sweet')
    assert.equal(row('Passion Oud').answers, 1)
    assert.equal(row('Oud').genericName, true)
    assert.equal(row('Oud').answers, 0)
    assert.equal(row('Black Oud').answers, 0)
    assert.equal(row('Vibe').overLimit, true)
    assert.equal(row('Vibe').answers, 0)
    assert.equal(v.notSeen, 2) // Oud and Black Oud; Vibe is over the limit, not "not seen"
    assert.deepStrictEqual(
        v.products.map((r) => r.shortName),
        ['Silk Oud', 'Passion Oud', 'Oud', 'Black Oud', 'Vibe']
    )
    // Aliases count too
    assert.equal(
        computeProductVisibility(current, [], 'Hasan Oud', [prod('Passion', { aliases: ['Passion Oud'] })] as never[], 3).products[0].answers,
        1
    )
    // No previous scan → previousAnswers null; no answer text at all → textAvailable false
    assert.equal(computeProductVisibility(current, [], 'Hasan Oud', products, 4).products[0].previousAnswers, null)
    assert.equal(computeProductVisibility([m('q', 'ChatGPT', '')], [], 'Hasan Oud', products, 4).textAvailable, false)
    assert.equal(computeProductVisibility([], [], 'Hasan Oud', [], 3).products.length, 0)
    assert.equal(isGenericName('Rose'), true)
    assert.equal(isGenericName('Silk Oud'), false)

    // Product questions from type and price
    const qs = suggestProductQuestions(prod('Silk Oud', { title: 'Silk Oud Premium Fragrances Alcohol Free Attar', price: 599 }) as never, [
        'Best attar under ₹600 in India'
    ])
    assert.deepStrictEqual(
        qs.map((q) => q.text),
        ['600 ke andar sabse accha attar']
    )
    assert.deepStrictEqual(suggestProductQuestions(prod('Bag', { title: 'Leather Bag', price: null }) as never, []), [])

    // Shopify fetch with a stubbed fetcher: pages until a short page, max 4 pages
    const page = (n: number, count: number) =>
        JSON.stringify({
            products: [...Array(count)].map((_, i) => ({
                id: n * 1000 + i,
                title: `P ${n}-${i}`,
                handle: `p-${n}-${i}`,
                variants: [{ price: '100' }]
            }))
        })
    const asked: string[] = []
    const two = await fetchShopifyProducts('hasanoud.com', async (u) => {
        asked.push(u)
        return u.includes('page=1') ? page(1, 250) : page(2, 3)
    })
    assert.equal(two.shopify, true)
    assert.equal(two.raw.length, 253)
    assert.equal(two.truncated, false)
    assert.ok(asked[0].startsWith('https://hasanoud.com/products.json?limit=250&page=1'), asked[0])
    const many = await fetchShopifyProducts('https://big.example', async (u) => page(Number(/page=(\d)/.exec(u)![1]), 250))
    assert.equal(many.raw.length, 1000)
    assert.equal(many.truncated, true)
    for (const body of ['<html>store</html>', '{"products": "x"}', '{}']) {
        assert.equal((await fetchShopifyProducts('https://x.example', async () => body)).shopify, false)
    }
    assert.equal(
        (
            await fetchShopifyProducts('https://x.example', async () => {
                throw new Error('404')
            })
        ).shopify,
        false
    )
    assert.equal((await fetchShopifyProducts('https://x.example', async () => '{"products": []}')).shopify, true)

    // AI names: one call, each answer validated, a broken reply keeps nothing
    const stub = aiService as unknown as { callAnyAvailableAi: (p: string, n?: number) => Promise<string | null> }
    stub.callAnyAvailableAi = async () => 'Here: {"0": "Passion Oud", "1": "Hasanoud Blue", "2": "Crystal Air"}'
    assert.deepStrictEqual(
        await aiShortNames(
            [
                'Passion Oud Strong FruIty Oud Attar by Hasanoud',
                'The Blue Premium fragrances By Hasan Oud',
                'Crystal air Powdery Amber Attar by Hasanoud'
            ],
            'Hasan Oud'
        ),
        ['Passion Oud', null, 'Crystal Air']
    )
    stub.callAnyAvailableAi = async () => null
    assert.deepStrictEqual(await aiShortNames(['A b'], 'X'), [null])

    console.log('products checks: PASS')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
