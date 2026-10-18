/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/serviceQueries.check.ts
import assert from 'assert'
import { promptFor, serviceNoun, templateQueries } from '../service/querySuggestionService'
import { siteProfile } from '../service/siteProfile'

assert.equal(serviceNoun('HealthTech & Healthcare'), 'healthcare service')
assert.equal(serviceNoun('Professional & Business Services'), 'professional service')
assert.equal(serviceNoun('Real Estate & Property'), 'real estate service')
assert.equal(serviceNoun('Dental Clinic'), 'dental clinic')
assert.equal(serviceNoun('FinTech'), 'local service')

const svc = siteProfile({ businessType: 'service', city: 'Mumbai' })
const list = templateQueries('HealthTech & Healthcare', 'Sabka Dentist', svc)
const texts = list.map((q) => q.text)
assert.equal(texts.length, 6, texts.join(' | '))
assert.equal(texts[0], 'Best healthcare service in Mumbai')
assert.ok(texts.some((t) => t === 'Mumbai me accha aur trusted healthcare service kaun sa hai'))
assert.equal(texts[5], 'Sabka Dentist reviews: kaisa hai, bharosa kar sakte hain?')
assert.ok(!texts.some((t) => /original|app\b|pharmacy|delivery/i.test(t)), texts.join(' | '))
// No city: "India"
assert.equal(
    templateQueries('HealthTech & Healthcare', '', siteProfile({ businessType: 'local_business' }))[0].text,
    'Best healthcare service in India'
)
// SaaS and media get their own lists
assert.ok(templateQueries('SaaS & Software', '', siteProfile({ businessType: 'saas' }))[0].text.includes('software'))
assert.ok(templateQueries('Media, Gaming & Entertainment', '', siteProfile({ businessType: 'content_media' }))[0].text.includes('websites'))
// Shops: unchanged
assert.deepEqual(
    templateQueries('Fragrances & Perfumes', 'Hasan Oud', siteProfile({ businessType: 'ecommerce' })),
    templateQueries('Fragrances & Perfumes', 'Hasan Oud')
)

// The AI prompt for a service talks about clients and the city, not shoppers and products
const p = promptFor({
    name: 'Sabka Dentist',
    website: 'https://sabkadentist.com',
    category: 'HealthTech & Healthcare',
    region: 'India',
    profile: svc
})
assert.ok(p.includes('clients') && p.includes('Mumbai') && !/shopper|products like/i.test(p), p)
const shopPrompt = promptFor({ name: 'Hasan Oud', category: 'Fragrances & Perfumes' })
assert.ok(shopPrompt.includes('Indian shoppers'))

console.log('serviceQueries checks: PASS')
process.exit(0)
