/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/indianQueries.check.ts
// No DB and no real AI: the AI call is stubbed
import assert from 'assert'
import aiService from '../service/aiService'
import databseService from '../service/databseService'
import costLogModel from '../model/costLogModel'
import brandController from '../controller/brandController'
import { cleanSuggestions, detectLang, detectVertical, suggestQueries, templateQueries } from '../service/querySuggestionService'

const texts = (qs: { text: string }[]) => qs.map((q) => q.text)

;(async () => {
    // detectVertical: admin-made category names still match by keyword
    assert.equal(detectVertical('Fragrances & Perfumes'), 'fragrance')
    assert.equal(detectVertical('Attar'), 'fragrance')
    assert.equal(detectVertical('Perfume & Deo'), 'fragrance')
    assert.equal(detectVertical('Skincare & Personal Care'), 'skincare')
    assert.equal(detectVertical('Fashion, Apparel & Accessories'), 'fashion')
    assert.equal(detectVertical('SaaS & Software'), 'saas')
    assert.equal(detectVertical('Artificial Intelligence & ML'), 'ai')
    assert.equal(detectVertical('Mother, Baby & Kids Care'), 'baby')
    assert.equal(detectVertical('E-Commerce & Retail'), 'retail')
    assert.equal(detectVertical('Other / General'), 'retail')
    assert.equal(detectVertical(''), 'retail')
    assert.equal(detectVertical('Scented Candles'), 'home')
    assert.equal(detectVertical('Cloud Kitchen'), 'food')
    assert.equal(detectVertical('Insurance & InsurTech'), 'generic')
    assert.equal(detectVertical('Real Estate & Property'), 'generic')

    // Generic (often B2B) categories: no gifts, festivals or rupee caps
    for (const c of ['Real Estate & Property', 'Cybersecurity & Data Privacy', 'Logistics & Supply Chain']) {
        const lower = texts(templateQueries(c, 'Acme')).map((t) => t.toLowerCase())
        assert.ok(!lower.some((t) => /gift|diwali|₹|ke andar/.test(t)), `shopping question in ${c}`)
        assert.ok(lower.length >= 6, `too few for ${c}`)
    }

    // Fragrance: the three questions from the feature list, Free plan's first 3 are the strongest
    const frag = templateQueries('Fragrances & Perfumes', 'Hasan Oud')
    const fragTexts = texts(frag)
    for (const q of [
        '500 ke andar sabse accha attar',
        'Shaadi ke liye kaunsa perfume lagayein',
        'Namaz ke liye alcohol free attar kaunsa accha hai'
    ]) {
        assert.ok(fragTexts.includes(q), `missing: ${q}`)
    }
    assert.deepStrictEqual(
        frag.slice(0, 3).map((q) => [q.lang, q.intent]),
        [
            ['HI-EN', 'Price'],
            ['HI-EN', 'Occasion'],
            ['EN', 'Best-of']
        ]
    )
    // Branded question last, and only when there is a brand
    assert.ok(fragTexts[fragTexts.length - 1].includes('Hasan Oud'))
    assert.equal(texts(templateQueries('Fragrances & Perfumes')).filter((t) => t.includes('Hasan Oud')).length, 0)
    assert.equal(fragTexts.filter((t) => t.includes('Hasan Oud')).length, 1)

    // Every list: unique texts, no generic "for your needs", 8+ questions, a price and an occasion question
    const categories = [
        'Fragrances & Perfumes',
        'Skincare & Personal Care',
        'Beauty & Cosmetics',
        'Fashion, Apparel & Accessories',
        'Jewelry, Watches & Luxury Goods',
        'Food & Beverage',
        'Fitness, Sports & Wellness',
        'Mother, Baby & Kids Care',
        'Home, Furniture & Living',
        'Consumer Electronics & Gadgets',
        'Pet Care & Supplies',
        'E-Commerce & Retail',
        'Scented Candles'
    ]
    for (const c of categories) {
        const qs = templateQueries(c, 'Acme')
        const lower = texts(qs).map((t) => t.toLowerCase())
        assert.equal(new Set(lower).size, lower.length, `duplicates in ${c}`)
        assert.ok(qs.length >= 8, `too few for ${c}`)
        assert.ok(!lower.some((t) => t.includes('for your needs')), `generic text in ${c}`)
        assert.ok(
            qs.some((q) => q.intent === 'Price'),
            `no price question in ${c}`
        )
        assert.ok(
            qs.some((q) => q.intent === 'Occasion'),
            `no occasion question in ${c}`
        )
        assert.ok(
            qs.some((q) => q.lang === 'HI-EN'),
            `no Hinglish in ${c}`
        )
    }
    // Generic list uses the category name
    assert.ok(texts(templateQueries('Logistics & Supply Chain')).some((t) => t.includes('logistics & supply chain')))
    // Non-D2C presets still come back
    assert.ok(templateQueries('SaaS & Software').length >= 5)

    // detectLang
    assert.equal(detectLang('500 ke andar sabse accha attar'), 'HI-EN')
    assert.equal(detectLang('Best perfume for men in India'), 'EN')
    assert.equal(detectLang('Best perfume to wear me'), 'EN')

    // cleanSuggestions: brand, duplicates (also vs existing), links, essays and fragments are dropped
    const raw = [
        { text: '1. "Shaadi ke liye best attar kaunsa hai"', lang: 'HI-EN', intent: 'Occasion' },
        { text: 'shaadi ke liye BEST attar kaunsa hai?', lang: 'HI-EN', intent: 'Occasion' },
        { text: 'Is Hasan Oud attar long lasting for office', lang: 'EN', intent: 'Direct' },
        { text: 'Best attar under ₹700 for daily use', lang: 'xx', intent: 'cheap' },
        { text: 'Garmi me kaunsa perfume lagayein office ke liye', intent: 'Occasion' },
        { text: '500 ke andar sabse accha attar', lang: 'HI-EN', intent: 'Price' },
        { text: 'Buy attar at https://example.com today', lang: 'EN', intent: 'Direct' },
        { text: 'attar', lang: 'EN', intent: 'Direct' },
        { text: 'word '.repeat(25), lang: 'EN', intent: 'Direct' },
        'Alcohol free perfume for namaz under ₹1000',
        42,
        null
    ]
    assert.deepStrictEqual(cleanSuggestions(raw, 'Hasan Oud', ['500 ke andar sabse accha attar']), [
        { text: 'Shaadi ke liye best attar kaunsa hai', lang: 'HI-EN', intent: 'Occasion' },
        { text: 'Best attar under ₹700 for daily use', lang: 'EN', intent: 'Price' },
        { text: 'Garmi me kaunsa perfume lagayein office ke liye', lang: 'HI-EN', intent: 'Occasion' },
        { text: 'Alcohol free perfume for namaz under ₹1000', lang: 'EN', intent: 'Price' }
    ])
    // "under ₹1000" and "under 1000" are the same question
    assert.deepStrictEqual(cleanSuggestions(['under ₹1000 best oud perfume India'], 'X', ['under 1000 best oud perfume India']), [])
    assert.deepStrictEqual(cleanSuggestions('not an array', 'X', []), [])
    assert.deepStrictEqual(cleanSuggestions({ text: 'a b c' }, 'X', []), [])
    const many = [...Array(30)].map((_, i) => ({ text: `Best attar number ${i} for office`, lang: 'EN', intent: 'Best-of' }))
    assert.equal(cleanSuggestions(many, 'X', []).length, 12)

    // suggestQueries: stubbed AI. Good JSON (with chatter around it) → cleaned; junk or no provider → []
    const stub = aiService as unknown as { callAnyAvailableAi: (p: string, n?: number) => Promise<string | null> }
    let prompt = ''
    stub.callAnyAvailableAi = async (p) => {
        prompt = p
        return `Sure! \`\`\`json\n${JSON.stringify(raw.slice(0, 5))}\n\`\`\``
    }
    const brand = { name: 'Hasan Oud', website: 'https://hasanoud.com', category: 'Fragrances & Perfumes' }
    const got = await suggestQueries(brand, [])
    assert.deepStrictEqual(texts(got), [
        'Shaadi ke liye best attar kaunsa hai',
        'Best attar under ₹700 for daily use',
        'Garmi me kaunsa perfume lagayein office ke liye'
    ])
    assert.ok(prompt.includes('Fragrances & Perfumes') && prompt.includes('500 ke andar sabse accha attar'))
    stub.callAnyAvailableAi = async () => 'sorry, I cannot help with that'
    assert.deepStrictEqual(await suggestQueries(brand, []), [])
    stub.callAnyAvailableAi = async () => null
    assert.deepStrictEqual(await suggestQueries(brand, []), [])
    stub.callAnyAvailableAi = async () => {
        throw new Error('network down')
    }
    assert.deepStrictEqual(await suggestQueries(brand, []), [])

    // API handlers with stubbed DB: templates, another org's brand → 404, daily cap → 429, AI result passed through
    type Res = { code?: number; body?: { data?: Record<string, unknown> }; status: (c: number) => Res; json: (b: unknown) => void }
    const call = async (handler: (...a: never[]) => unknown, req: Record<string, unknown>) => {
        const res: Res = {
            status(c) {
                this.code = c
                return this
            },
            json(b) {
                this.body = b as Res['body']
            }
        }
        let err: { statusCode?: number; message?: string } | undefined
        await (handler as (q: unknown, r: unknown, n: unknown) => unknown)(
            { method: 'GET', originalUrl: '/x', ...req },
            res,
            (e: typeof err) => (err = e)
        )
        return { code: err?.statusCode ?? res.code, data: res.body?.data, message: err?.message }
    }
    const tpl = await call(brandController.getQueryTemplates, { query: { category: 'Attar', brand: 'Hasan Oud' } })
    assert.equal(tpl.code, 200)
    assert.equal(tpl.data?.vertical, 'fragrance')
    assert.ok((tpl.data?.queries as unknown[]).length >= 10)

    const db = databseService as unknown as Record<string, unknown>
    db.findOrgByOwnerId = async () => ({ _id: 'org1' })
    const savedBrand = {
        _id: 'b1',
        name: 'Hasan Oud',
        website: 'https://hasanoud.com',
        category: 'Attar',
        queries: [{ text: 'Garmi me kaunsa perfume lagayein office ke liye' }]
    }
    db.findBrandByIdAndOrgId = async (id: string) => (id === 'b1' ? savedBrand : null)
    let used = 0
    ;(costLogModel as unknown as { countDocuments: () => Promise<number> }).countDocuments = async () => used
    stub.callAnyAvailableAi = async () => JSON.stringify(raw.slice(0, 5))
    const authed = { authenticatedUser: { _id: 'u1', name: 'U' } }

    assert.equal((await call(brandController.suggestQueries, { ...authed, params: { id: 'other' }, body: {} })).code, 404)
    const ok = await call(brandController.suggestQueries, {
        ...authed,
        params: { id: 'b1' },
        body: { existing: ['Best attar under ₹700 for daily use'] }
    })
    assert.equal(ok.code, 200)
    // Saved query and the unsaved one from the page are both left out
    assert.deepStrictEqual(texts(ok.data?.queries as { text: string }[]), ['Shaadi ke liye best attar kaunsa hai'])
    stub.callAnyAvailableAi = async () => null
    const empty = await call(brandController.suggestQueries, { ...authed, params: { id: 'b1' }, body: {} })
    assert.equal(empty.code, 200)
    assert.ok(String(empty.data?.message).includes('not available'))
    used = 10
    const capped = await call(brandController.suggestQueries, { ...authed, params: { id: 'b1' }, body: {} })
    assert.equal(capped.code, 429)

    console.log('indian queries checks: PASS')
    process.exit(0)
})().catch((e) => {
    console.error(e)
    process.exit(1)
})
