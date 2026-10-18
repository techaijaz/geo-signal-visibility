/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/serviceRecommendations.check.ts
import assert from 'assert'
import aiService from '../service/aiService'
import { defaultRecommendations } from '../service/defaultRecommendations'
import { generateRecommendations } from '../service/recommendationService'
import { siteProfile } from '../service/siteProfile'
import type { IAuditData } from '../types/auditTypes'
import type { IBrand } from '../types/brandTypes'
;(async () => {
    const base = { brandId: 'b1', brandName: 'Hasan Oud', comp1: 'Ajmal', category: 'Fragrances & Perfumes', audit: null }
    // Shops: today's list, word for word
    const shop = defaultRecommendations({ ...base, profile: siteProfile({ businessType: 'ecommerce' }) })
    assert.deepEqual(
        shop.map((r) => r.text),
        [
            'Unblock Google-Extended in robots.txt so Gemini can crawl Hasan Oud',
            'Publish an llms.txt with a clear, structured summary of what Hasan Oud sells',
            'Add FAQPage schema to your top 10 product pages for Hasan Oud',
            'Publish a direct "Hasan Oud vs. Ajmal" comparison page',
            'Collect 20+ verified customer reviews for Hasan Oud on your primary sales channel or Google/Trustpilot',
            'Build a genuine presence in relevant Fragrances & Perfumes subreddits & online forums'
        ]
    )
    assert.ok(shop[1].snippet?.includes('specializing in high-quality products'))

    // A dental clinic in Mumbai: no product talk, local tasks
    const svc = defaultRecommendations({
        ...base,
        brandName: 'Sabka Dentist',
        comp1: 'Clove Dental',
        category: 'HealthTech & Healthcare',
        profile: siteProfile({ businessType: 'service', city: 'Mumbai' })
    })
    const all = svc.map((r) => [r.text, r.reasoning, r.snippet].join(' ')).join(' | ')
    assert.ok(!/product|sales channel|ingredient/i.test(all), `product talk: ${all}`)
    const kinds = svc.map((r) => r.kind)
    assert.ok(kinds.includes('local-listing') && kinds.includes('service-schema'), kinds.join(','))
    assert.ok(svc.some((r) => r.text === 'Add FAQPage schema to your main service pages for Sabka Dentist'))
    assert.ok(svc.some((r) => r.text === 'Collect 20+ verified reviews for Sabka Dentist on Google Business Profile in Mumbai'))
    assert.ok(svc.some((r) => r.text === 'Get Sabka Dentist listed on Google Business Profile, Justdial and directories like Practo in Mumbai'))
    // SaaS: no product talk, no local tasks
    const saas = defaultRecommendations({ ...base, profile: siteProfile({ businessType: 'saas' }) })
    assert.ok(!saas.some((r) => r.kind === 'local-listing' || r.kind === 'service-schema'))
    assert.ok(saas.some((r) => r.text === 'Add FAQPage schema to your main pages for Hasan Oud'))

    // The LocalBusiness task goes once the audit finds that schema
    const audit = {
        structuredData: [{ name: 'Service / ProfessionalService schema', status: 'Found', badgeType: 'badge-ok' }]
    } as unknown as IAuditData
    const done = defaultRecommendations({ ...base, audit, profile: siteProfile({ businessType: 'service' }) })
    assert.ok(!done.some((r) => r.kind === 'service-schema'))

    // The AI prompt tells the model the brand sells no products, and gives the city
    let prompt = ''
    ;(aiService as unknown as { callAnyAvailableAi: (p: string) => Promise<null> }).callAnyAvailableAi = async (p: string) => {
        prompt = p
        return null
    }
    const brand = {
        _id: 'b1',
        name: 'Sabka Dentist',
        category: 'HealthTech & Healthcare',
        businessType: 'service',
        city: 'Mumbai',
        website: 'https://sabkadentist.com',
        competitors: []
    } as unknown as IBrand
    await generateRecommendations(brand, {} as IAuditData, [], [])
    assert.ok(prompt.includes('This brand does not sell products.'), 'no-products line')
    assert.ok(prompt.includes('Mumbai'), 'city')
    assert.ok(prompt.includes('local-listing'), 'new kinds listed')
    await generateRecommendations({ ...brand, businessType: 'ecommerce' } as unknown as IBrand, {} as IAuditData, [], [])
    assert.ok(!prompt.includes('does not sell products'), 'shop prompt unchanged')

    console.log('serviceRecommendations checks: PASS')
    process.exit(0)
})().catch((e) => {
    console.error(e)
    process.exit(1)
})
