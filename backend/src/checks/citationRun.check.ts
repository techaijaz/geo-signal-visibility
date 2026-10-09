/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/citationRun.check.ts (needs the local Mongo)
import assert from 'assert'
import mongoose from 'mongoose'
import config from '../config/config'
import brandModel from '../model/brandModel'
import orgModel from '../model/orgModel'
import citationRunModel from '../model/citationRunModel'
import { runCitationScan, type ICitationDeps } from '../service/citationService'
;(async () => {
    await mongoose.connect(config.DATABASE_URL as string)
    const org = await orgModel.create({ name: 'Citation Check Org', ownerId: new mongoose.Types.ObjectId(), plan: 'starter' })
    const brand = await brandModel.create({
        orgId: org._id,
        name: 'Hasan Oud',
        website: 'https://www.hasanoud.com/',
        category: 'Fragrances & Perfumes',
        competitors: [{ name: 'Ajmal', website: 'https://www.ajmal.com' }, { name: 'Adil Qadri' }],
        queries: [{ text: 'best attar for gifting' }, { text: 'alcohol free attar' }]
    })
    const brandId = String(brand._id)
    const pages: Record<string, string> = {
        'https://lbb.in/all/best-attars': '<title>Best attars in India</title><p>Ajmal Wisal and AdilQadri Shanaya</p>',
        'https://in.ajmal.com/p/1': '<title>Ajmal</title><p>Ajmal Dahn al Oudh</p>',
        'https://hasanoud.com/products/silk': '<title>Silk Oud</title><p>Hasan Oud Silk</p>'
    }
    const sources = [
        { title: 'lbb.in', uri: 'r1' },
        { title: 'ajmal.com', uri: 'r2' },
        { title: 'blocked.in', uri: 'r3' },
        { title: 'hasanoud.com', uri: 'r4' }
    ]
    const redirects: Record<string, string> = {
        r1: 'https://lbb.in/all/best-attars?utm_source=gemini',
        r2: 'https://in.ajmal.com/p/1',
        r3: 'http://10.0.0.5/internal',
        r4: 'https://hasanoud.com/products/silk#reviews'
    }
    const deps = (over: Partial<ICitationDeps> = {}): ICitationDeps => ({
        grounded: async () => ({
            text: 'Ajmal and Adil Qadri are popular.',
            sources,
            supports: [{ text: 'Adil Qadri attars are popular for gifting', chunks: [2] }]
        }),
        resolve: async (uri) => redirects[uri],
        fetchText: async (url) => {
            if (!pages[url]) throw new Error('blocked')
            return pages[url]
        },
        now: new Date('2026-10-11T16:30:00Z'),
        ...over
    })

    try {
        // A full run: pages merged across questions, cleaned URLs, types, brands from page or answer
        assert.equal(await runCitationScan(brandId, deps()), 'ok')
        const run = (await citationRunModel.findOne({ brandId }).lean())!
        assert.equal(run.status, 'ok')
        assert.equal(run.week, '2026-W41')
        assert.equal(run.questions.length, 2)
        const lbb = run.pages.find((p) => p.domain === 'lbb.in')!
        assert.equal(lbb.url, 'https://lbb.in/all/best-attars')
        assert.equal(lbb.title, 'Best attars in India')
        assert.deepEqual(lbb.citedIn, ['best attar for gifting', 'alcohol free attar'])
        assert.deepEqual(lbb.brands, ['Ajmal', 'Adil Qadri'])
        assert.equal(lbb.type, 'article')
        assert.equal(lbb.readFrom, 'page')
        assert.equal(run.pages.find((p) => p.domain === 'in.ajmal.com')!.type, 'competitor')
        const own = run.pages.find((p) => p.domain === 'hasanoud.com')!
        assert.equal(own.type, 'own')
        assert.equal(own.brandFound, true)
        // Unreadable (private) page → brands from the answer text it supports
        const blocked = run.pages.find((p) => p.domain === '10.0.0.5')!
        assert.equal(blocked.readFrom, 'answer')
        assert.deepEqual(blocked.brands, ['Adil Qadri'])

        // Same week again → skipped, no second run
        assert.equal(await runCitationScan(brandId, deps()), 'skipped')
        assert.equal(await citationRunModel.countDocuments({ brandId }), 1)

        // Every question fails → failed run
        assert.equal(await runCitationScan(brandId, deps({ grounded: async () => null, now: new Date('2026-10-18T16:30:00Z') })), 'failed')
        assert.equal((await citationRunModel.findOne({ brandId, week: '2026-W42' }).lean())!.status, 'failed')

        // Free plan → skipped, nothing written
        await orgModel.updateOne({ _id: org._id }, { plan: 'free' })
        assert.equal(await runCitationScan(brandId, deps({ now: new Date('2026-10-25T16:30:00Z') })), 'skipped')
        assert.equal(await citationRunModel.countDocuments({ brandId, week: '2026-W43' }), 0)
        await orgModel.updateOne({ _id: org._id }, { plan: 'starter' })

        // Only the last 8 runs are kept
        for (let i = 0; i < 8; i++) await runCitationScan(brandId, deps({ now: new Date(Date.UTC(2026, 10, 1 + i * 7, 16)) }))
        assert.equal(await citationRunModel.countDocuments({ brandId }), 8)
        assert.equal(await citationRunModel.countDocuments({ brandId, week: '2026-W41' }), 0)

        console.log('citationRun checks passed')
    } finally {
        await citationRunModel.deleteMany({ brandId })
        await brandModel.deleteOne({ _id: brand._id })
        await orgModel.deleteOne({ _id: org._id })
        await mongoose.disconnect()
    }
    process.exit(0)
})().catch((err) => {
    console.error(err)
    process.exit(1)
})
