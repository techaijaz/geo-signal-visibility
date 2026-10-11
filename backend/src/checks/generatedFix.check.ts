/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/generatedFix.check.ts (needs the local Mongo)
import assert from 'assert'
import mongoose from 'mongoose'
import { PLAN_LIMITS } from '../config/planLimits'
import generatedFixModel from '../model/generatedFixModel'
import { istMonthStart, nextResetLabel, countFixUsage } from '../service/fix/usage'
import { kindsOf, pickOwnUrls, wonQueries, OTHER_KIND } from '../service/fix/pickPages'

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
