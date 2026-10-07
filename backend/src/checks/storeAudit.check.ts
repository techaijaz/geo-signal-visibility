/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/storeAudit.check.ts
import assert from 'assert'
import { scoreProductPage, scoreCollectionPage } from '../service/storeAuditService'

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

    console.log('store audit checks: PASS')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
