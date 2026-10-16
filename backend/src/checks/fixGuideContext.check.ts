/* eslint-disable no-console */
// Run: SMTP_HOST= NODE_ENV=development npx ts-node --transpile-only src/checks/fixGuideContext.check.ts
import assert from 'assert'
import mongoose from 'mongoose'
import config from '../config/config'
import auditModel from '../model/auditModel'
import { guideContext, withAuditKinds, withFeedKinds } from '../service/fixGuide'
import { isShopifyHtml, shopifyFlag } from '../service/aiViewService'
;(async () => {
    await mongoose.connect(config.DATABASE_URL as string)
    const id = new mongoose.Types.ObjectId()
    // no audit, no products → not Shopify, empty email, guides for the kinds asked
    let ctx = await guideContext({ _id: id }, ['reviews', undefined])
    assert.equal(ctx.isShopify, false)
    assert.equal(ctx.developerEmail, '')
    assert.deepEqual(Object.keys(ctx.guides).sort(), ['other', 'reviews'])
    // a Shopify product → Shopify
    ctx = await guideContext({ _id: id, products: [{ shopifyId: '123' }] }, [])
    assert.equal(ctx.isShopify, true)
    // audit flag → Shopify
    await auditModel.create({ brandId: id, isShopify: true })
    ctx = await guideContext({ _id: id, developerEmail: 'dev@agency.in' }, [])
    assert.equal(ctx.isShopify, true)
    assert.equal(ctx.developerEmail, 'dev@agency.in')
    await auditModel.deleteMany({ brandId: id })
    assert.equal(isShopifyHtml('<script src="https://cdn.shopify.com/x.js"></script>'), true)
    // A re-audit that could not fetch the homepage keeps the last known answer
    assert.equal(shopifyFlag(true, ''), true)
    assert.equal(shopifyFlag(undefined, ''), false)
    assert.equal(shopifyFlag(true, '<html>plain site</html>'), false)
    assert.equal(shopifyFlag(false, '<link href="//cdn.shopify.com/s.css">'), true)

    // Failing audit checks and feed checks get a guide kind; passing ones are left alone
    const audit = {
        storeAudit: {
            pages: [
                {
                    url: 'https://s.com/products/a',
                    kind: 'product',
                    checks: [
                        { key: 'alt', pass: false },
                        { key: 'price', pass: true }
                    ]
                },
                { url: 'https://s.com/collections/b', kind: 'collection', checks: [{ key: 'schema', pass: false }] }
            ]
        },
        aiView: {
            pages: [
                {
                    url: 'https://s.com/products/a',
                    rows: [
                        { key: 'price', missingForAi: true },
                        { key: 'name', missingForAi: false }
                    ]
                }
            ]
        }
    }
    const kinds = withAuditKinds(audit)
    assert.equal((audit.storeAudit.pages[0].checks[0] as { kind?: string }).kind, 'alt-text')
    assert.equal((audit.storeAudit.pages[0].checks[1] as { kind?: string }).kind, undefined)
    assert.equal((audit.storeAudit.pages[1].checks[0] as { kind?: string }).kind, 'collection-schema')
    assert.equal((audit.aiView.pages[0].rows[0] as { kind?: string }).kind, 'js-content')
    assert.deepEqual(kinds.sort(), ['alt-text', 'collection-schema', 'js-content'])
    assert.deepEqual(withAuditKinds({}), [])
    const feed = {
        products: [
            {
                checks: [
                    { key: 'gtin', pass: false },
                    { key: 'title', pass: true }
                ]
            }
        ],
        summary: [{ key: 'image', failing: 3 }]
    }
    assert.deepEqual(withFeedKinds(feed).sort(), ['images', 'product-ids'])
    assert.equal((feed.summary[0] as { kind?: string }).kind, 'images')
    assert.deepEqual(withFeedKinds(null), [])
    console.log('fixGuideContext checks: PASS')
    process.exit(0)
})().catch((e) => {
    console.error(e)
    process.exit(1)
})
