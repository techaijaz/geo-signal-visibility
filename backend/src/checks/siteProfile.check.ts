/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/siteProfile.check.ts
import assert from 'assert'
import { siteProfile } from '../service/siteProfile'
import { validationCreateBrandBody, validationUpdateBrandBody } from '../service/validationService'
import brandModel from '../model/brandModel'

// Each businessType maps to a type; only shops sell products by default
assert.deepEqual(siteProfile({ businessType: 'ecommerce' }), {
    type: 'shop',
    sellsProducts: true,
    city: '',
    pagesWord: 'product pages',
    place: 'India'
})
assert.equal(siteProfile({ businessType: 'service' }).type, 'service')
assert.equal(siteProfile({ businessType: 'local_business' }).type, 'local')
assert.equal(siteProfile({ businessType: 'saas' }).type, 'saas')
assert.equal(siteProfile({ businessType: 'content_media' }).type, 'media')
for (const t of ['service', 'local_business', 'saas', 'content_media']) assert.equal(siteProfile({ businessType: t }).sellsProducts, false, t)
assert.equal(siteProfile({ businessType: 'service' }).pagesWord, 'main pages')
// Old brands and unknown values read as a shop
assert.equal(siteProfile({}).type, 'shop')
assert.equal(siteProfile(null).sellsProducts, true)
assert.equal(siteProfile({ businessType: 'constructor' }).type, 'shop')
// The switch overrides both ways; null follows the type
assert.equal(siteProfile({ businessType: 'service', sellsProducts: true }).sellsProducts, true)
assert.equal(siteProfile({ businessType: 'service', sellsProducts: true }).pagesWord, 'product pages')
assert.equal(siteProfile({ businessType: 'ecommerce', sellsProducts: false }).sellsProducts, false)
assert.equal(siteProfile({ businessType: 'ecommerce', sellsProducts: null }).sellsProducts, true)
// City: trimmed, only for service and local
assert.equal(siteProfile({ businessType: 'local_business', city: '  Mumbai ' }).city, 'Mumbai')
assert.equal(siteProfile({ businessType: 'local_business', city: '  Mumbai ' }).place, 'Mumbai')
assert.equal(siteProfile({ businessType: 'ecommerce', city: 'Mumbai' }).city, '')
assert.equal(siteProfile({ businessType: 'saas', city: 'Pune' }).place, 'India')

// Validation: city rules, sellsProducts true/false/null
const upd = (body: object) => validationUpdateBrandBody.validate(body)
assert.equal(upd({ city: 'Andheri West, Mumbai' }).error, undefined)
assert.equal(upd({ city: '' }).error, undefined)
assert.equal(upd({ city: '<script>' }).error?.message, 'Use letters and spaces only, like Mumbai or Andheri West')
assert.ok(upd({ city: 'a'.repeat(61) }).error)
for (const v of [true, false, null]) assert.equal(upd({ sellsProducts: v }).error, undefined, String(v))
assert.ok(upd({ sellsProducts: 'yes' }).error)
const created = validationCreateBrandBody.validate({
    name: 'Sabka Dentist',
    website: 'https://sabkadentist.com',
    category: 'HealthTech & Healthcare',
    city: ' Mumbai '
})
assert.equal(created.error, undefined)
assert.equal(created.value.city, 'Mumbai')

// Brand JSON carries the computed sellsProducts (an old document with no new fields reads as selling products)
const json = (doc: object) => new brandModel(doc).toJSON() as unknown as { sellsProducts: boolean; city: string }
const base = { orgId: '64b000000000000000000001', name: 'X', website: 'https://x.com', category: 'Y' }
assert.equal(json(base).sellsProducts, true)
assert.equal(json({ ...base, businessType: 'service' }).sellsProducts, false)
assert.equal(json({ ...base, businessType: 'service', sellsProducts: true }).sellsProducts, true)
assert.equal(json({ ...base, businessType: 'service', city: 'Pune' }).city, 'Pune')

console.log('siteProfile checks: PASS')
process.exit(0)
