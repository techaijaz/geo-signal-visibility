/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/fixImpact.check.ts
import assert from 'assert'
import {
    groupFixEvents,
    measureGroup,
    pickEmailGroup,
    pickOverviewGroup,
    fixResultLine,
    type IScanPoint,
    type IFixGroup
} from '../service/fixImpactService'
import { renderWeeklyEmail } from '../service/reportService/weeklyReport'
import type { IReportData } from '../service/reportService/reportData'
import type { IFixEvent } from '../types/fixEventTypes'

const DAY = 24 * 60 * 60 * 1000
const T0 = new Date('2026-09-01T10:00:00Z').getTime()
const at = (d: number) => new Date(T0 + d * DAY)

let n = 0
const ev = (d: number, over: Partial<IFixEvent> = {}): IFixEvent => ({
    _id: `e${++n}`,
    brandId: 'b1',
    recommendationId: `r${n}`,
    text: `Fix ${n}`,
    category: 'Technical',
    source: 'user',
    verified: false,
    doneAt: at(d),
    undoneAt: null,
    emailedAt: null,
    ...over
})
const scan = (d: number, scores: Record<string, number>): IScanPoint => ({
    scannedAt: at(d),
    models: Object.entries(scores).map(([name, score]) => ({ name, score }))
})

const run = async () => {
    // Grouping: within 7 days of the group's FIRST event, no chaining; undone events dropped
    const a = ev(0)
    const b = ev(6)
    const c = ev(12)
    const undone = ev(3, { undoneAt: at(4) })
    const groups = groupFixEvents([c, undone, b, a])
    assert.equal(groups.length, 2)
    assert.deepEqual(
        groups[0].map((e) => e._id),
        [a._id, b._id]
    )
    assert.deepEqual(
        groups[1].map((e) => e._id),
        [c._id]
    )

    // Windows: before = 14 days before first; after = 7..30 days after last
    const one = [ev(0)]
    const scans = [
        scan(-15, { ChatGPT: 90, Gemini: 90 }), // outside before window
        scan(-10, { ChatGPT: 10, Gemini: 0 }),
        scan(-1, { ChatGPT: 20, Gemini: 10 }),
        scan(6, { ChatGPT: 90, Gemini: 90 }), // first week skipped
        scan(8, { ChatGPT: 30, Gemini: 20, Perplexity: 80 }), // Perplexity only after → ignored
        scan(15, { ChatGPT: 40, Gemini: 30 }),
        scan(31, { ChatGPT: 0, Gemini: 0 }) // outside after window
    ]
    const g = measureGroup(one, scans, at(40), 24)
    assert.equal(g.state, 'final')
    assert.equal(g.before, 10) // ChatGPT 15, Gemini 5 → 10
    assert.equal(g.after, 30) // ChatGPT 35, Gemini 25 → 30
    assert.equal(g.delta, 20)
    assert.equal(g.result, 'up')
    assert.deepEqual(g.engines, [
        { name: 'ChatGPT', before: 15, after: 35 },
        { name: 'Gemini', before: 5, after: 25 }
    ])
    assert.equal(g.fixes.length, 1)
    assert.deepEqual(g.eventIds, [String(one[0]._id)])

    // States
    assert.equal(measureGroup([ev(0)], [scan(8, { ChatGPT: 10 }), scan(9, { ChatGPT: 10 })], at(40), 24).state, 'no-before')
    const measuring = measureGroup([ev(0)], [scan(-2, { ChatGPT: 10 }), scan(7.5, { ChatGPT: 10 })], at(8), 24)
    assert.equal(measuring.state, 'measuring')
    assert.ok(measuring.daysLeft! >= 1)
    assert.equal(measuring.before, undefined)
    const interim = measureGroup([ev(0)], [scan(-2, { ChatGPT: 10 }), scan(8, { ChatGPT: 20 }), scan(9, { ChatGPT: 20 })], at(10), 24)
    assert.equal(interim.state, 'interim')
    assert.equal(interim.delta, 10)
    assert.equal(measureGroup([ev(0)], [scan(-2, { ChatGPT: 10 }), scan(8, { ChatGPT: 20 })], at(31), 24).state, 'no-after')

    // M2: an overdue estimate drops the number instead of saying "about 1 day" for weeks
    const overdue = measureGroup([ev(0)], [scan(-2, { ChatGPT: 10 }), scan(8, { ChatGPT: 10 })], at(20), 24)
    assert.equal(overdue.state, 'measuring')
    assert.equal(overdue.daysLeft, undefined)

    // Result bands: > +3 up, -3..+3 flat, < -3 down
    const band = (after: number) =>
        measureGroup([ev(0)], [scan(-2, { ChatGPT: 50 }), scan(8, { ChatGPT: after }), scan(9, { ChatGPT: after })], at(40), 24).result
    assert.equal(band(54), 'up')
    assert.equal(band(53), 'flat')
    assert.equal(band(47), 'flat')
    assert.equal(band(46), 'down')

    // A group is verified only when every fix is; emailed when any event was emailed
    const mixed = measureGroup([ev(0, { verified: true }), ev(1)], [], at(40), 24)
    assert.equal(mixed.verified, false)
    assert.equal(measureGroup([ev(0, { verified: true })], [], at(40), 24).verified, true)
    assert.equal(measureGroup([ev(0, { emailedAt: at(35) })], [], at(40), 24).emailed, true)

    // Email pick: final + up + not emailed, biggest delta
    const G = (over: Partial<IFixGroup>): IFixGroup => ({
        start: at(0),
        end: at(0),
        fixes: [],
        eventIds: [],
        verified: false,
        emailed: false,
        state: 'final',
        result: 'up',
        delta: 5,
        ...over
    })
    assert.equal(pickEmailGroup([G({ state: 'interim' }), G({ result: 'flat' }), G({ emailed: true })]), null)
    assert.equal(pickEmailGroup([G({ delta: 5 }), G({ delta: 9 })])!.delta, 9)

    // Overview pick: up (interim or final), last 60 days, biggest delta
    const now = at(100)
    assert.equal(pickOverviewGroup([G({ end: at(30), delta: 20 })], now), null) // older than 60 days
    assert.equal(pickOverviewGroup([G({ end: at(50), state: 'measuring', result: undefined })], now), null)
    assert.equal(pickOverviewGroup([G({ end: at(50), state: 'interim', delta: 4 }), G({ end: at(60), delta: 8 })], now)!.delta, 8)

    // Monday email line: first fix + "N more", its date, before → after
    const fix = (text: string) => ({ text, category: 'Technical', verified: true, doneAt: new Date('2026-09-12T06:00:00Z') })
    assert.equal(
        fixResultLine(G({ fixes: [fix('Add FAQ schema')], before: 12, after: 19 })),
        'Result: after Add FAQ schema (12 Sept) your AI visibility went from 12% to 19% ↑'
    )
    assert.equal(
        fixResultLine(G({ fixes: [fix('Add llms.txt'), fix('Add FAQ schema'), fix('Fix robots.txt')], before: 12, after: 19 })),
        'Result: after Add llms.txt + 2 more (12 Sept) your AI visibility went from 12% to 19% ↑'
    )
    const report = {
        brandName: 'Hasan Oud',
        website: 'https://hasanoud.com',
        generatedAt: '',
        scannedAt: null,
        visibility: 19,
        previousVisibility: 12,
        engines: [{ name: 'ChatGPT', score: 19, mentioned: 2, total: 10 }],
        trend: [],
        questions: [],
        shareOfVoice: null,
        audit: null,
        recommendations: []
    } as unknown as IReportData
    const withLine = renderWeeklyEmail(report, 'https://x/unsub', 'Result: after Add FAQ schema (12 Sept) your AI visibility went from 12% to 19% ↑')
    assert.ok(withLine.text.includes('Result: after Add FAQ schema'))
    assert.ok(withLine.html.includes('Result: after Add FAQ schema'))
    const without = renderWeeklyEmail(report, 'https://x/unsub')
    assert.ok(!without.text.includes('Result:') && !without.html.includes('Result:'))
    assert.ok(!without.text.includes('undefined') && !without.html.includes('undefined'))

    console.log('fixImpact checks passed')
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
