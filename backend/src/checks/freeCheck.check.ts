/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/freeCheck.check.ts
import assert from 'assert'
import { freeCheckQuestions } from '../service/querySuggestionService'
import {
    normaliseSiteUrl,
    siteFacts,
    istDay,
    nextMorningIst,
    newCheckId,
    hashOtp,
    isDisposableEmail,
    normaliseEmail,
    countryFromTz,
    halfResult,
    fullResult
} from '../service/freeCheck/helpers'
import type { IFreeCheck } from '../types/freeCheckTypes'
import { memoryStore, consume, refund, KEYS } from '../service/freeCheck/store'

// Every seeded category (script/seed categories)
const CATEGORIES = [
    'SaaS & Software',
    'E-Commerce & Retail',
    'Fragrances & Perfumes',
    'FinTech & Banking',
    'HealthTech & Healthcare',
    'EdTech & Learning',
    'Skincare & Personal Care',
    'Beauty & Cosmetics',
    'Food & Beverage',
    'Travel & Hospitality',
    'Real Estate & Property',
    'Automotive & Mobility',
    'Consumer Electronics & Gadgets',
    'Home, Furniture & Living',
    'Fashion, Apparel & Accessories',
    'Media, Gaming & Entertainment',
    'Artificial Intelligence & ML',
    'Cybersecurity & Data Privacy',
    'Cloud, DevOps & Infrastructure',
    'Marketing, Advertising & PR',
    'HRTech & Recruitment',
    'LegalTech & Compliance',
    'Logistics, Supply Chain & Delivery',
    'Fitness, Sports & Wellness',
    'Jewelry, Watches & Luxury Goods',
    'Mother, Baby & Kids Care',
    'Pet Care & Supplies',
    'Agriculture & AgriTech',
    'Renewable Energy & CleanTech',
    'Crypto, Web3 & Blockchain',
    'Construction & Architecture',
    'Professional & Business Services',
    'Non-Profit, NGO & Social Impact',
    'Events, Ticketing & Entertainment',
    'Industrial, Manufacturing & B2B',
    'Insurance & InsurTech',
    'Other / General'
]

const run = async () => {
    // Questions: no branded question, at least 4 English per category, no weak "comparison with competitors" lines
    for (const c of CATEGORIES) {
        const qs = freeCheckQuestions(c)
        assert.ok(qs.length >= 7, `${c}: ${qs.length} questions`)
        assert.ok(qs.filter((q) => q.lang === 'EN').length >= 4, `${c}: fewer than 4 EN`)
        assert.ok(!qs.some((q) => /reviews: original/.test(q.text)), `${c}: branded question present`)
        assert.ok(
            !qs.some((q) => /^(Comparison with|Hidden charges|Course quality|Medicine delivery speed|API performance)/.test(q.text)),
            `${c}: weak question`
        )
    }

    // URL
    assert.deepEqual(normaliseSiteUrl('https://www.HasanOud.com/'), { url: 'https://www.hasanoud.com/', domain: 'hasanoud.com' })
    assert.deepEqual(normaliseSiteUrl('hasanoud.com'), { url: 'https://hasanoud.com/', domain: 'hasanoud.com' })
    assert.equal(normaliseSiteUrl('ftp://x.com'), null)
    assert.equal(normaliseSiteUrl('not a url'), null)
    assert.equal(normaliseSiteUrl('http://localhost:3000'), null)
    assert.equal(normaliseSiteUrl('http://192.168.1.5/'), null)

    // Homepage facts (no AI): og:site_name, else the shortest <title> part; category by the vertical rules
    const cats = ['Fragrances & Perfumes', 'Skincare & Personal Care', 'E-Commerce & Retail']
    assert.deepEqual(
        siteFacts(
            '<meta property="og:site_name" content="Hasan Oud"><title>Buy Attar Online | Hasan Oud</title><meta name="description" content="Pure oud and attar">',
            cats
        ),
        { brandName: 'Hasan Oud', category: 'Fragrances & Perfumes' }
    )
    assert.deepEqual(siteFacts('<title>Glowleaf – Natural skin care</title>', cats), { brandName: 'Glowleaf', category: 'Skincare & Personal Care' })
    assert.deepEqual(siteFacts('<div id="root"></div>', cats), { brandName: '', category: '' }) // JS shell
    assert.deepEqual(siteFacts('', cats), { brandName: '', category: '' })
    assert.deepEqual(siteFacts('<title>Acme Tools</title>', cats), { brandName: 'Acme Tools', category: '' }) // no rule matches

    // IST day and next morning
    assert.equal(istDay(new Date('2026-10-10T20:00:00Z')), '2026-10-11') // 01:30 IST
    assert.equal(nextMorningIst(new Date('2026-10-10T10:00:00Z')).toISOString(), '2026-10-11T00:30:00.000Z')

    // Ids, OTP, email
    assert.match(newCheckId(), /^[A-Za-z0-9_-]{32}$/)
    assert.notEqual(newCheckId(), newCheckId())
    assert.equal(hashOtp('123456', 'abc'), hashOtp('123456', 'abc'))
    assert.notEqual(hashOtp('123456', 'abc'), hashOtp('123456', 'abd'))
    assert.equal(isDisposableEmail('x@mailinator.com'), true)
    assert.equal(isDisposableEmail('owner@hasanoud.com'), false)
    assert.equal(normaliseEmail(' Owner@HasanOud.com '), 'owner@hasanoud.com')
    assert.equal(normaliseEmail('nope'), null)
    assert.equal(countryFromTz('Asia/Kolkata'), 'IN')
    assert.equal(countryFromTz('Asia/Dubai'), 'Asia/Dubai')

    // Results: half has counts only, full has names
    const check = {
        checkId: 'c1',
        brandName: 'Hasan Oud',
        status: 'done',
        questions: [
            {
                text: 'q1',
                answers: [
                    { engine: 'ChatGPT', ok: true, named: false, position: null, brands: ['Ajmal', 'Al Haramain'] },
                    { engine: 'Gemini', ok: true, named: true, position: 3, brands: ['Ajmal'] }
                ]
            },
            {
                text: 'q2',
                answers: [
                    { engine: 'ChatGPT', ok: false, named: false, position: null, brands: [] },
                    { engine: 'Gemini', ok: true, named: false, position: null, brands: ['Ajmal', 'Rasasi'] }
                ]
            }
        ]
    } as unknown as IFreeCheck
    const half = halfResult(check)
    assert.equal(half.namedCount, 1)
    assert.equal(half.total, 3) // failed answers don't count
    assert.equal(half.otherBrandsCount, 3)
    assert.deepEqual(half.failedEngines, [])
    assert.ok(!JSON.stringify(half).includes('Ajmal'))
    const full = fullResult(check)
    assert.deepEqual(full.otherBrands, [
        { name: 'Ajmal', count: 3 },
        { name: 'Al Haramain', count: 1 },
        { name: 'Rasasi', count: 1 }
    ])

    // Limits: counted per day key; over the limit is refused and not counted; refund gives one back
    const s = memoryStore()
    const day = '2026-10-10'
    assert.equal(await consume(s, KEYS.ipChecks('h'), 3, day), true)
    assert.equal(await consume(s, KEYS.ipChecks('h'), 3, day), true)
    assert.equal(await consume(s, KEYS.ipChecks('h'), 3, day), true)
    assert.equal(await consume(s, KEYS.ipChecks('h'), 3, day), false)
    await refund(s, KEYS.ipChecks('h'), day)
    assert.equal(await consume(s, KEYS.ipChecks('h'), 3, day), true)
    assert.equal(await consume(s, KEYS.ipChecks('h'), 3, '2026-10-11'), true) // new day
    assert.equal(await consume(s, KEYS.global, 0, day), false) // a 0 limit allows nothing
    await s.set(KEYS.cache('h', 'hasanoud.com'), 'c1', 60)
    assert.equal(await s.get(KEYS.cache('h', 'hasanoud.com')), 'c1')
    await s.del(KEYS.cache('h', 'hasanoud.com'))
    assert.equal(await s.get(KEYS.cache('h', 'hasanoud.com')), null)
    assert.equal(await s.setOnce(KEYS.alert + day, 60), true)
    assert.equal(await s.setOnce(KEYS.alert + day, 60), false)

    console.log('freeCheck checks passed')
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
