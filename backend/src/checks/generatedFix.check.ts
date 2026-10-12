/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/generatedFix.check.ts (needs the local Mongo)
import assert from 'assert'
import mongoose from 'mongoose'
import { PLAN_LIMITS } from '../config/planLimits'
import generatedFixModel from '../model/generatedFixModel'
import { istMonthStart, nextResetLabel, countFixUsage, expireStaleFixes } from '../service/fix/usage'
import { kindsOf, pickOwnUrls, wonQueries, rankCompetitors, OTHER_KIND } from '../service/fix/pickPages'
import { pageText, readPages, homepageLinks } from '../service/fix/readPages'
import { buildFixPrompt, parseFixResponse } from '../service/fix/prompt'
import { fixOutputs } from '../service/fix/output'
import { runFix, fixAi } from '../service/fix/runFix'
import { createFix } from '../service/fix/createFix'
import brandModel from '../model/brandModel'

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
    // ...and with no kinds at all, whole brand reads up to 8 of them, not just 2
    assert.deepEqual(pickOwnUrls({ type: 'faq', kind: null, products: others }), ['https://s.in/g1', 'https://s.in/g2', 'https://s.in/g3'])
    // Competitor picker: who won most often first, then tracked ones the AI never named
    assert.deepEqual(
        rankCompetitors(
            [
                { name: 'Fogg', answers: 2 },
                { name: 'Ajmal', answers: 7 },
                { name: 'ajmal', answers: 1 }
            ],
            ['Adil Qadri', 'Ajmal']
        ),
        ['Ajmal', 'Fogg', 'Adil Qadri']
    )
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
        '{"title":"Hasan Oud vs Ajmal","items":[{"heading":"Price","body":"..","source":"https://s.in/a1"},{"heading":"Differences","rows":[' +
            '{"label":"Price","brand":"₹799","competitor":"[confirm: price]","source":"https://s.in/a1"},' +
            '{"label":"Longevity","brand":"10 hours","competitor":"6 hours"},' +
            '{"label":"Size","brand":"12 ml","competitor":"10 ml","source":"https://evil.com/x"}]}]}',
        'comparison',
        allowed
    )!
    assert.equal(cmpParsed.items.length, 2)
    const rows = cmpParsed.items[1].rows!
    assert.deepEqual(rows[0], { label: 'Price', brand: '₹799', competitor: '[confirm: price]' })
    // A table row with no source, or one we didn't read, can't pass an invented value as fact
    assert.deepEqual(rows[1], { label: 'Longevity', brand: '[confirm] 10 hours', competitor: '[confirm] 6 hours' })
    assert.deepEqual(rows[2], { label: 'Size', brand: '[confirm] 12 ml', competitor: '[confirm] 10 ml' })
    // An answer with no source at all is marked too, so it stays out of the FAQ schema
    const noSource = parseFixResponse('{"title":"t","items":[{"question":"Q?","answer":"Made in India."}]}', 'faq', allowed)!
    assert.equal(noSource.items[0].answer, '[confirm: no source] Made in India.')
    assert.equal(
        parseFixResponse('{"title":"t","items":[{"question":"Q?","answer":"[confirm: origin]"}]}', 'faq', allowed)!.items[0].answer,
        '[confirm: origin]'
    )

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
        { ...base, status: 'pending', createdAt: new Date(now.getTime() - 20 * 60_000) },
        { ...base, status: 'done', createdAt: new Date('2026-09-30T18:29:00Z') } // 23:59 IST 30 Sep
    ])
    assert.equal(await countFixUsage(String(orgId), now), 2)

    // Worker job
    const brand = await brandModel.create({
        orgId,
        name: 'Hasan Oud',
        website: 'https://s.in',
        category: 'Fragrances & Perfumes',
        products,
        competitors: [{ name: 'Ajmal', website: 'https://ajmal.example' }]
    })
    const mk = (extra: object) => generatedFixModel.create({ ...base, brandId: brand._id, status: 'pending', ...extra })
    const okAi = async () => '{"title":"Attar FAQ","items":[{"question":"Alcohol-free?","answer":"Yes.","source":"https://s.in/a1"}]}'
    const fetchOk = async () => html
    const noLost = async () => []
    const noSaid = async () => []

    // Happy path: done, items saved, pages recorded, note when some pages failed
    const f1 = await mk({ type: 'faq', kind: 'attar' })
    await runFix(String(f1._id), {
        fetch: async (u) => (u.endsWith('a2') ? Promise.reject(new Error('x')) : html),
        ai: okAi,
        byQuestion: noLost,
        aiSaid: noSaid
    })
    const d1 = (await generatedFixModel.findById(f1._id).lean())!
    assert.equal(d1.status, 'done')
    assert.equal(d1.items[0].source, 'https://s.in/a1')
    assert.equal(d1.pagesRead.filter((pg) => pg.ok).length, 4)
    assert.equal(d1.note, 'Read 4 of 5 pages')

    // No page opens: failed, with the reason, not counted
    const f2 = await mk({ type: 'faq', kind: 'attar' })
    await runFix(String(f2._id), { fetch: async () => Promise.reject(new Error('blocked')), ai: okAi, byQuestion: noLost, aiSaid: noSaid })
    const d2 = (await generatedFixModel.findById(f2._id).lean())!
    assert.equal(d2.status, 'failed')
    assert.ok(d2.error!.startsWith("Couldn't open pages on your site"))

    // Broken JSON once then good: done (one retry); broken twice: failed
    let calls = 0
    const f3 = await mk({ type: 'faq', kind: 'attar' })
    await runFix(String(f3._id), { fetch: fetchOk, ai: async () => (++calls === 1 ? 'oops' : await okAi()), byQuestion: noLost, aiSaid: noSaid })
    assert.equal((await generatedFixModel.findById(f3._id).lean())!.status, 'done')
    assert.equal(calls, 2)
    const f4 = await mk({ type: 'faq', kind: 'attar' })
    await runFix(String(f4._id), { fetch: fetchOk, ai: async () => 'oops', byQuestion: noLost, aiSaid: noSaid })
    assert.equal((await generatedFixModel.findById(f4._id).lean())!.error, "Couldn't write this one, try again")

    // Comparison: competitor pages read too, and their URLs are allowed sources
    const seen: string[] = []
    const f5 = await mk({ type: 'comparison', competitor: 'Ajmal' })
    await runFix(String(f5._id), {
        fetch: async (u) => {
            seen.push(u)
            return u.startsWith('https://ajmal.example') ? '<a href="/products/x">x</a><main>Ajmal oud</main>' : html
        },
        ai: async () => '{"title":"Hasan Oud vs Ajmal","items":[{"heading":"About Ajmal","body":"Oud maker.","source":"https://ajmal.example"}]}',
        byQuestion: async () => [
            { queryText: 'best bakhoor for home', rows: [{ model: 'ChatGPT', you: null, others: [{ name: 'Ajmal', position: 1 }] }] }
        ],
        aiSaid: async () => ['Ajmal is a known oud brand']
    })
    const d5 = (await generatedFixModel.findById(f5._id).lean())!
    assert.equal(d5.status, 'done')
    assert.ok(seen.includes('https://s.in/b1') && seen.includes('https://ajmal.example'))
    assert.equal(d5.items[0].source, 'https://ajmal.example')

    // Competitor with no saved website: no competitor page fetched, prompt says so, still done
    await brandModel.updateOne({ _id: brand._id }, { $push: { competitors: { name: 'Fogg' } } })
    const fetched: string[] = []
    let sentPrompt = ''
    const f6 = await mk({ type: 'comparison', competitor: 'Fogg' })
    await runFix(String(f6._id), {
        fetch: async (u) => {
            fetched.push(u)
            return html
        },
        ai: async (pr) => {
            sentPrompt = pr
            return '{"title":"Hasan Oud vs Fogg","items":[{"heading":"About Fogg","body":"[confirm: what Fogg sells]"}]}'
        },
        byQuestion: noLost,
        aiSaid: noSaid
    })
    assert.equal((await generatedFixModel.findById(f6._id).lean())!.status, 'done')
    assert.ok(fetched.every((u) => u.startsWith('https://s.in')))
    assert.ok(sentPrompt.includes('none could be read') && sentPrompt.includes('nothing stored'))

    // A fix that isn't pending (already done or failed) is left alone
    await runFix(String(f1._id), {
        fetch: fetchOk,
        ai: async () => {
            throw new Error('should not run')
        },
        byQuestion: noLost,
        aiSaid: noSaid
    })

    // A job picked up after the stale window (queue backlog) fails instead of running, so it can't
    // finish "done" after the slot was already given back
    const stale = await mk({ type: 'faq', kind: 'attar', createdAt: new Date(Date.now() - 20 * 60_000) })
    await runFix(String(stale._id), {
        fetch: fetchOk,
        ai: async () => {
            throw new Error('should not run')
        },
        byQuestion: noLost,
        aiSaid: noSaid
    })
    const ds = (await generatedFixModel.findById(stale._id).lean())!
    assert.equal(ds.status, 'failed')
    assert.equal(ds.error, 'Took too long to start, try again')
    // The same job delivered twice runs once
    let runs = 0
    const twice = await mk({ type: 'faq', kind: 'attar' })
    const once = { fetch: fetchOk, ai: async () => (runs++, okAi()), byQuestion: noLost, aiSaid: noSaid }
    await Promise.all([runFix(String(twice._id), once), runFix(String(twice._id), once)])
    assert.equal(runs, 1)
    // A job lost by a worker restart shows as failed, not "Writing…" forever
    const lost = await mk({ type: 'faq', kind: 'attar', createdAt: new Date(Date.now() - 20 * 60_000) })
    await expireStaleFixes(String(brand._id))
    assert.equal((await generatedFixModel.findById(lost._id).lean())!.status, 'failed')

    // Whole brand also reads the homepage
    const wholeSeen: string[] = []
    const whole = await mk({ type: 'faq', kind: null })
    await runFix(String(whole._id), {
        fetch: async (u) => (wholeSeen.push(u), html),
        ai: okAi,
        byQuestion: noLost,
        aiSaid: noSaid
    })
    assert.equal(wholeSeen[0], 'https://s.in')

    // The fix writer: a long, slow answer gets 2 minutes and no paid retries, with room for 12 Hindi answers
    const keyOwner = (await import('../service/databseService')).default as unknown as { getDecryptedApiKey: (k: string) => Promise<string> }
    const realKey = keyOwner.getDecryptedApiKey
    const realFetch = globalThis.fetch
    const bodies: Array<{ max_tokens?: number }> = []
    keyOwner.getDecryptedApiKey = async () => 'test-key'
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)))
        return new Response('busy', { status: 503 })
    }) as typeof fetch
    try {
        assert.equal(await fixAi('prompt'), null)
    } finally {
        globalThis.fetch = realFetch
        keyOwner.getDecryptedApiKey = realKey
    }
    assert.equal(bodies.length, 2) // Claude once, OpenAI once: a 503 isn't retried
    assert.ok(bodies.every((b) => b.max_tokens === 8000))

    // Claude's answer may open with a thinking block: the text block after it is the answer, no OpenAI call
    let claudeCalls = 0
    keyOwner.getDecryptedApiKey = async () => 'test-key'
    globalThis.fetch = (async () => {
        claudeCalls++
        return new Response(
            JSON.stringify({
                content: [
                    { type: 'thinking', thinking: 'planning' },
                    { type: 'text', text: '{"items":[]}' }
                ],
                usage: { input_tokens: 1, output_tokens: 1 }
            }),
            { status: 200 }
        )
    }) as typeof fetch
    try {
        assert.equal(await fixAi('prompt'), '{"items":[]}')
    } finally {
        globalThis.fetch = realFetch
        keyOwner.getDecryptedApiKey = realKey
    }
    assert.equal(claudeCalls, 1)

    // Creating: free plan has 1; a second request the same month is refused with the reset date
    const org2 = String(new mongoose.Types.ObjectId())
    const req = {
        orgId: org2,
        brandId: String(brand._id),
        userId: String(base.userId),
        plan: 'free' as const,
        type: 'faq' as const,
        kind: 'attar',
        language: 'en' as const
    }
    const queued: string[] = []
    const enq = async (id: string) => queued.push(id)
    const first = await createFix(req, enq, now)
    assert.ok(first.ok && queued.length === 1)
    const second = await createFix(req, enq, now)
    assert.deepEqual(second, { ok: false, status: 403, message: "You've used all 1 generations this month. They reset on 1 Nov." })
    // Parallel clicks on the last generation: exactly one gets through
    const org3 = String(new mongoose.Types.ObjectId())
    const both = await Promise.all([createFix({ ...req, orgId: org3 }, enq, now), createFix({ ...req, orgId: org3 }, enq, now)])
    assert.equal(both.filter((r) => r.ok).length, 1)
    // Queue down: the fix is marked failed and the slot is freed
    const org4 = String(new mongoose.Types.ObjectId())
    const down = await createFix({ ...req, orgId: org4 }, async () => null, now)
    assert.equal(down.ok, false)
    assert.equal(await countFixUsage(org4, now), 0)

    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
    console.log('generated fix checks passed')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
