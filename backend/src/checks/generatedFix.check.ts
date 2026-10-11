/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/generatedFix.check.ts (needs the local Mongo)
import assert from 'assert'
import mongoose from 'mongoose'
import { PLAN_LIMITS } from '../config/planLimits'
import generatedFixModel from '../model/generatedFixModel'
import { istMonthStart, nextResetLabel, countFixUsage } from '../service/fix/usage'
import { kindsOf, pickOwnUrls, wonQueries, OTHER_KIND } from '../service/fix/pickPages'
import { pageText, readPages, homepageLinks } from '../service/fix/readPages'
import { buildFixPrompt, parseFixResponse } from '../service/fix/prompt'
import { fixOutputs } from '../service/fix/output'

const p = (title: string, url: string) => ({
    shopifyId: null,
    title,
    shortName: title,
    aliases: [],
    url,
    price: null,
    image: '',
    productType: '',
    nameEditedByUser: false
})
const products = [
    p('Silk Oud Attar 12ml', 'https://s.in/a1'),
    p('Black Oud Attar', 'https://s.in/a2'),
    p('Musk Attar', 'https://s.in/a3'),
    p('Rose Attar', 'https://s.in/a4'),
    p('Amber Attar', 'https://s.in/a5'),
    p('Mukhallat Attar', 'https://s.in/a6'),
    p('Royal Bakhoor', 'https://s.in/b1'),
    p('Gift Box', 'https://s.in/g1')
]

const run = async () => {
    // Choosing pages
    assert.deepEqual(kindsOf(products), [
        { kind: 'attar', count: 6 },
        { kind: 'bakhoor', count: 1 },
        { kind: OTHER_KIND, count: 1 }
    ])
    // One kind: up to 5 of that kind, in saved order
    assert.deepEqual(pickOwnUrls({ type: 'faq', kind: 'attar', products }), [
        'https://s.in/a1',
        'https://s.in/a2',
        'https://s.in/a3',
        'https://s.in/a4',
        'https://s.in/a5'
    ])
    assert.deepEqual(pickOwnUrls({ type: 'faq', kind: OTHER_KIND, products }), ['https://s.in/g1'])
    // Whole brand: 2 per kind, max 8
    assert.deepEqual(pickOwnUrls({ type: 'faq', kind: null, products }), ['https://s.in/a1', 'https://s.in/a2', 'https://s.in/b1', 'https://s.in/g1'])
    // Comparison: kinds in the questions the competitor won, up to 4
    const byQuestion = [
        { queryText: 'best bakhoor for home', rows: [{ model: 'ChatGPT', you: null, others: [{ name: 'Ajmal', position: 1 }] }] },
        { queryText: 'best attar under 500', rows: [{ model: 'Gemini', you: 3, others: [{ name: 'Fogg', position: 1 }] }] }
    ]
    assert.deepEqual(wonQueries(byQuestion, 'ajmal'), ['best bakhoor for home'])
    assert.deepEqual(pickOwnUrls({ type: 'comparison', competitor: 'Ajmal', products, byQuestion }), ['https://s.in/b1'])
    // Competitor that won nothing we can map to a kind: whole-brand pick, capped at 4
    assert.equal(pickOwnUrls({ type: 'comparison', competitor: 'Nobody', products, byQuestion }).length, 4)
    // Only products with no detectable kind: one "Other" group, and both "Other" and whole brand pick them
    const others = [p('Gift Box', 'https://s.in/g1'), p('Combo Pack', 'https://s.in/g2'), p('Travel Set', 'https://s.in/g3')]
    assert.deepEqual(kindsOf(others), [{ kind: OTHER_KIND, count: 3 }])
    assert.deepEqual(pickOwnUrls({ type: 'faq', kind: OTHER_KIND, products: others }), ['https://s.in/g1', 'https://s.in/g2', 'https://s.in/g3'])
    assert.deepEqual(pickOwnUrls({ type: 'faq', kind: null, products: others }), ['https://s.in/g1', 'https://s.in/g2'])
    // No saved products: nothing here (the runner falls back to homepage links)
    assert.deepEqual(pickOwnUrls({ type: 'faq', kind: 'attar', products: [] }), [])

    // Reading pages
    const html = `<html><head><title>Silk Oud</title></head><body><nav>Menu Cart</nav><main><h1>Silk Oud Attar</h1>
        <p>Alcohol-free attar. Lasts 10-12 hours.</p><p>₹799</p><p>4.6 out of 5 (120 reviews)</p></main><footer>© shop</footer></body></html>`
    const pt = pageText('https://s.in/a1', html)
    assert.equal(pt.title, 'Silk Oud Attar')
    assert.ok(pt.text.includes('Alcohol-free attar') && !pt.text.includes('Menu Cart'))
    assert.equal(pt.price, '₹799')
    // Long pages are cut at ~1,500 words
    assert.ok(pageText('u', `<main>${'word '.repeat(3000)}</main>`).text.split(' ').length <= 1500)
    // A page that fails is reported, others still read
    const fake = async (u: string) => (u.endsWith('bad') ? Promise.reject(new Error('timeout')) : html)
    const r = await readPages(['https://s.in/a1', 'https://s.in/bad'], fake)
    assert.equal(r.pages.length, 1)
    assert.deepEqual(r.read, [
        { url: 'https://s.in/a1', ok: true },
        { url: 'https://s.in/bad', ok: false }
    ])
    // Homepage fallback: the homepage plus product links on it
    const home = `<a href="/products/silk-oud">x</a><a href="/products/musk">y</a><a href="/about">z</a>`
    assert.deepEqual(await homepageLinks('https://s.in', async () => home), [
        'https://s.in',
        'https://s.in/products/silk-oud',
        'https://s.in/products/musk'
    ])

    // Prompt and parsing
    const prompt = buildFixPrompt({
        type: 'faq',
        brandName: 'Hasan Oud',
        kind: 'attar',
        language: 'hi-en',
        questions: ['500 ke andar accha attar'],
        pages: [pt]
    })
    assert.ok(prompt.includes('ONLY the page text') && prompt.includes('[confirm:') && prompt.includes('Hinglish'))
    assert.ok(prompt.includes('https://s.in/a1') && prompt.includes('500 ke andar accha attar'))
    const cmp = buildFixPrompt({
        type: 'comparison',
        brandName: 'Hasan Oud',
        competitor: 'Ajmal',
        language: 'en',
        questions: [],
        pages: [pt],
        aiSaid: ['Ajmal is known for...']
    })
    assert.ok(cmp.includes('Never say anything negative about Ajmal'))

    const allowed = ['https://s.in/a1']
    const raw =
        'Here you go:\n```json\n{"title":"Attar FAQ","items":[' +
        '{"question":"Is it alcohol-free?","answer":"Yes.","source":"https://s.in/a1"},' +
        '{"question":"Delivery time?","answer":"2 days","source":"https://evil.com/x"},' +
        '{"question":"","answer":"x","source":"https://s.in/a1"}]}\n```'
    const parsed = parseFixResponse(raw, 'faq', allowed)!
    assert.equal(parsed.title, 'Attar FAQ')
    assert.equal(parsed.items.length, 2) // the empty question is dropped
    assert.equal(parsed.items[0].source, 'https://s.in/a1')
    assert.equal(parsed.items[1].answer, '[confirm: source not found] 2 days')
    assert.equal(parsed.items[1].source, undefined)
    assert.equal(parseFixResponse('not json at all', 'faq', allowed), null)
    assert.equal(parseFixResponse('{"title":"x","items":[]}', 'faq', allowed), null) // nothing usable
    const cmpParsed = parseFixResponse(
        '{"title":"Hasan Oud vs Ajmal","items":[{"heading":"Price","body":"..","source":"https://s.in/a1"},{"heading":"Differences","rows":[{"label":"Price","brand":"₹799","competitor":"[confirm: price]"}]}]}',
        'comparison',
        allowed
    )!
    assert.equal(cmpParsed.items.length, 2)
    assert.equal(cmpParsed.items[1].rows![0].brand, '₹799')

    // Outputs: text, HTML, FAQ schema
    const faqOut = fixOutputs({
        type: 'faq',
        title: 'Attar FAQ',
        items: [
            { question: 'Is it alcohol-free?', answer: 'Yes <b>100%</b>.', source: 'https://s.in/a1' },
            { question: 'Delivery?', answer: '[confirm: delivery days]' }
        ]
    })
    assert.ok(faqOut.text.startsWith('Attar FAQ') && faqOut.text.includes('Q: Is it alcohol-free?'))
    assert.ok(faqOut.html.includes('<h3>Is it alcohol-free?</h3>') && faqOut.html.includes('Yes &lt;b&gt;100%&lt;/b&gt;.'))
    const ld = JSON.parse(faqOut.jsonLd!.replace(/^<script type="application\/ld\+json">|<\/script>$/g, ''))
    assert.equal(ld['@type'], 'FAQPage')
    assert.equal(ld.mainEntity.length, 1) // the [confirm] item is left out until the owner fills it
    assert.equal(ld.mainEntity[0].acceptedAnswer.text, 'Yes <b>100%</b>.')
    assert.ok(!faqOut.jsonLd!.includes('<b>')) // "<" escaped so an answer can't close the script tag
    const cmpOut = fixOutputs({
        type: 'comparison',
        title: 'A vs B',
        items: [{ heading: 'Differences', rows: [{ label: 'Price', brand: '₹799', competitor: '₹999' }] }]
    })
    assert.ok(cmpOut.html.includes('<table>') && cmpOut.html.includes('<td>₹799</td>') && cmpOut.jsonLd === null)

    await mongoose.connect('mongodb://127.0.0.1:27017/signal_fix_check')
    await mongoose.connection.dropDatabase()

    // Limits
    assert.deepEqual(
        [
            PLAN_LIMITS.free.maxFixGenerations,
            PLAN_LIMITS.starter.maxFixGenerations,
            PLAN_LIMITS.growth.maxFixGenerations,
            PLAN_LIMITS.agency.maxFixGenerations
        ],
        [1, 10, 30, 150]
    )

    // IST month: 31 Oct 23:59 IST is October, 1 Nov 00:00 IST is November
    assert.equal(istMonthStart(new Date('2026-10-31T18:29:00Z')).toISOString(), '2026-09-30T18:30:00.000Z')
    assert.equal(istMonthStart(new Date('2026-10-31T18:30:00Z')).toISOString(), '2026-10-31T18:30:00.000Z')
    assert.equal(nextResetLabel(new Date('2026-10-12T10:00:00Z')), '1 Nov')
    assert.equal(nextResetLabel(new Date('2026-12-20T10:00:00Z')), '1 Jan')

    // Usage: done counts, failed doesn't, fresh pending counts, stale pending doesn't, last month doesn't
    const orgId = new mongoose.Types.ObjectId()
    const now = new Date('2026-10-12T10:00:00Z')
    const base = { orgId, brandId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), type: 'faq', language: 'en' }
    await generatedFixModel.create([
        { ...base, status: 'done', createdAt: new Date('2026-10-02T00:00:00Z') },
        { ...base, status: 'failed', createdAt: new Date('2026-10-03T00:00:00Z') },
        { ...base, status: 'pending', createdAt: new Date(now.getTime() - 60_000) },
        { ...base, status: 'pending', createdAt: new Date(now.getTime() - 10 * 60_000) },
        { ...base, status: 'done', createdAt: new Date('2026-09-30T18:29:00Z') } // 23:59 IST 30 Sep
    ])
    assert.equal(await countFixUsage(String(orgId), now), 2)

    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
    console.log('generated fix checks passed')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
