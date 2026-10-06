/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/products.check.ts
import assert from 'assert'
import { ruleShortName, cleanProductList, validateAiShortName, mergeRefresh } from '../service/productService'
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

    console.log('products checks: PASS')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
