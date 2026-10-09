/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/citations.check.ts
import assert from 'assert'
import {
    CITATION_QUESTIONS,
    pickQuestions,
    cleanUrl,
    domainOf,
    pageType,
    brandsOnText,
    buildOutreach,
    topSources,
    ownSiteLine,
    citationEmailLine,
    citationView,
    titleOf,
    textOf,
    isRecentWeek,
    groundedUsage,
    type ICitedPage
} from '../service/citationService'
import type { ICitationRun } from '../types/citationTypes'
import { renderWeeklyEmail } from '../service/reportService/weeklyReport'
import type { IReportData } from '../service/reportService/reportData'

const page = (over: Partial<ICitedPage>): ICitedPage => ({
    url: 'https://lbb.in/all/best-attars',
    domain: 'lbb.in',
    title: 'Best attars',
    type: 'article',
    citedIn: ['q1'],
    brands: ['Ajmal'],
    brandFound: false,
    readFrom: 'page',
    ...over
})

const run = async () => {
    // Plan caps
    assert.deepEqual(CITATION_QUESTIONS, { free: 0, starter: 5, growth: 10, agency: 20 })

    // Lost questions first (competitor named, brand not), then saved order, capped
    const queries = ['q1', 'q2', 'q3', 'q4']
    const latest = [
        { queryText: 'q1', mentioned: true, brandsNamed: [{ name: 'Ajmal' }] },
        { queryText: 'q2', mentioned: false, brandsNamed: [{ name: 'Fogg' }] }, // untracked → not "lost"
        { queryText: 'q3', mentioned: false, brandsNamed: [{ name: 'AdilQadri' }] },
        { queryText: 'q4', mentioned: false, brandsNamed: [{ name: 'Ajmal' }] }
    ]
    assert.deepEqual(pickQuestions(queries, latest, ['Ajmal', 'Adil Qadri'], 3), ['q3', 'q4', 'q1'])
    assert.deepEqual(pickQuestions(queries, [], ['Ajmal'], 2), ['q1', 'q2']) // no scan yet → saved order
    assert.deepEqual(pickQuestions(queries, latest, ['Ajmal'], 0), [])

    // URL cleaning and domains
    assert.equal(cleanUrl('https://x.in/a?utm_source=openai&id=2#top'), 'https://x.in/a?id=2')
    assert.equal(cleanUrl('https://x.in/a?utm_source=openai'), 'https://x.in/a')
    assert.equal(cleanUrl('https://x.in/a#top'), cleanUrl('https://x.in/a?utm_medium=x'))
    assert.equal(cleanUrl('not a url'), 'not a url')
    assert.equal(domainOf('https://www.lbb.in/all'), 'lbb.in')
    assert.equal(domainOf('nonsense'), '')

    // Types by domain
    const own = 'https://www.hasanoud.com/'
    assert.equal(pageType('https://www.flipkart.com/x/p/1', own, []), 'marketplace')
    assert.equal(pageType('https://amazon.in/dp/1', own, []), 'marketplace')
    assert.equal(pageType('https://www.youtube.com/watch?v=1', own, []), 'video')
    assert.equal(pageType('https://youtu.be/1', own, []), 'video')
    assert.equal(pageType('https://hasanoud.com/products/silk', own, []), 'own')
    assert.equal(pageType('https://shop.hasanoud.com/x', 'hasanoud.com', []), 'own')
    assert.equal(pageType('https://in.ajmal.com/products/x', own, ['https://www.ajmal.com']), 'competitor')
    assert.equal(pageType('https://lbb.in/all/best-attars', own, []), 'article')

    // Brand matching on page text: whole names, aliases, no-space forms
    const names = [{ name: 'Adil Qadri' }, { name: 'Ajmal', aliases: ['Ajmal Perfumes'] }, { name: 'Glow' }]
    assert.deepEqual(brandsOnText('Try AdilQadri Shanaya and Ajmal Perfumes Wisal', names), ['Adil Qadri', 'Ajmal'])
    assert.deepEqual(brandsOnText('Glowleaf serum', names), [])
    assert.deepEqual(brandsOnText('', names), [])

    // Outreach: competitor on page, brand not, no own/competitor sites; order and New badge
    const pages = [
        page({ url: 'https://a.in/1', domain: 'a.in', citedIn: ['q1'], brands: ['Ajmal'] }),
        page({ url: 'https://b.in/1', domain: 'b.in', citedIn: ['q1', 'q2'], brands: ['Ajmal'] }),
        page({ url: 'https://c.in/1', domain: 'c.in', citedIn: ['q1'], brands: ['Ajmal', 'Adil Qadri'] }),
        page({ url: 'https://flipkart.com/1', domain: 'flipkart.com', type: 'marketplace', citedIn: ['q1'], brands: ['Ajmal', 'Adil Qadri'] }),
        page({ url: 'https://d.in/1', domain: 'd.in', brands: ['Ajmal'], brandFound: true }), // brand there → not a target
        page({ url: 'https://e.in/1', domain: 'e.in', brands: [] }), // no competitor → not a target
        page({ url: 'https://in.ajmal.com/1', domain: 'in.ajmal.com', type: 'competitor', brands: ['Ajmal'] }),
        page({ url: 'https://hasanoud.com/1', domain: 'hasanoud.com', type: 'own', brands: [] })
    ]
    const out = buildOutreach(pages, new Set(['https://a.in/1']))
    assert.deepEqual(
        out.map((p) => p.url),
        ['https://b.in/1', 'https://c.in/1', 'https://flipkart.com/1', 'https://a.in/1']
    )
    assert.equal(out.find((p) => p.url === 'https://a.in/1')!.isNew, false)
    assert.equal(out[0].isNew, true)
    assert.equal(out.find((p) => p.type === 'marketplace')!.tip, 'List your product here and collect reviews')
    assert.equal(out[0].tip, 'Reach out to be included')

    // Top sources by citations, max 10
    const top = topSources([...pages, page({ url: 'https://b.in/2', domain: 'b.in', citedIn: ['q3'] })])
    assert.deepEqual(top[0], { domain: 'b.in', count: 3 })
    assert.ok(top.length <= 10)

    // Own site line: own citations vs the most cited competitor site
    const line = ownSiteLine(
        [
            page({ type: 'own', domain: 'hasanoud.com', citedIn: [] }),
            page({ type: 'competitor', domain: 'in.ajmal.com', brands: ['Ajmal'], citedIn: ['q1', 'q2'] }),
            page({ type: 'competitor', domain: 'in.ajmal.com', brands: ['Ajmal'], citedIn: ['q3'] })
        ],
        10
    )
    assert.deepEqual(line, { own: 0, questions: 10, topCompetitor: { name: 'Ajmal', count: 3 } })

    // Email line: new first; none for an empty list
    assert.equal(
        citationEmailLine(buildOutreach([page({ title: 'Best attars', domain: 'lbb.in', brands: ['Ajmal', 'Al Haramain'] })], new Set())),
        'Top source to reach this week: lbb.in — Best attars (names Ajmal, Al Haramain; not you)'
    )
    assert.equal(citationEmailLine([]), null)

    // View: latest ok run shown; a failed or running latest falls back to the last ok run; New only vs a previous ok run
    const R = (week: string, status: ICitationRun['status'], ps: ICitedPage[]): ICitationRun => ({
        brandId: 'b',
        week,
        status,
        startedAt: new Date(),
        finishedAt: new Date('2026-10-11T17:00:00Z'),
        questions: [
            { text: 'q1', ok: status === 'ok' },
            { text: 'q2', ok: false }
        ],
        pages: ps
    })
    const A = page({ url: 'https://a.in/1', domain: 'a.in' })
    const B = page({ url: 'https://b.in/1', domain: 'b.in' })
    assert.equal(citationView([]).run, null)
    const first = citationView([R('2026-W41', 'ok', [A])])
    assert.equal(first.outreach.length, 1)
    assert.equal(first.newCount, 0) // first run: nothing to compare with
    assert.deepEqual(first.counts, { questions: 2, failed: 1, pages: 1, read: 1 })
    const second = citationView([R('2026-W42', 'ok', [A, B]), R('2026-W41', 'ok', [A])])
    assert.equal(second.newCount, 1)
    assert.equal(second.outreach.find((p) => p.url === 'https://b.in/1')!.isNew, true)
    const failed = citationView([R('2026-W43', 'failed', []), R('2026-W42', 'ok', [A, B]), R('2026-W41', 'ok', [A])])
    assert.equal(failed.failedLatest, true)
    assert.equal(failed.run!.week, '2026-W42')
    assert.equal(failed.newCount, 1)
    const running = citationView([R('2026-W43', 'running', [])])
    assert.equal(running.run!.status, 'running')
    assert.equal(running.outreach.length, 0)

    // Monday email: the line shows (escaped in HTML) next to the fix line; absent without one
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
    const cl = 'Top source to reach this week: lbb.in — Best <attars> & oud (names Ajmal; not you)'
    const mail = renderWeeklyEmail(report, 'https://x/unsub', undefined, cl)
    assert.ok(mail.text.includes(cl))
    assert.ok(mail.html.includes('Best &lt;attars&gt; &amp; oud'))
    assert.ok(!mail.html.includes('<attars>'))
    const plain = renderWeeklyEmail(report, 'https://x/unsub')
    assert.ok(!plain.text.includes('Top source') && !plain.html.includes('Top source'))

    // I7: a website on a shared platform (Instagram, an Amazon store) never claims the whole platform
    assert.equal(pageType('https://www.amazon.in/dp/B01', own, ['https://www.amazon.in/stores/ajmal']), 'marketplace')
    assert.equal(pageType('https://www.instagram.com/p/x', 'https://instagram.com/hasanoud', []), 'article')
    assert.equal(pageType('https://linktr.ee/other', own, ['https://linktr.ee/ajmal']), 'article')

    // I3: a run stuck in "running" for hours is shown as failed (never re-run, so never paid twice)
    const stuck = { ...R('2026-W43', 'running', []), startedAt: new Date(Date.now() - 4 * 3600 * 1000) }
    const stuckView = citationView([stuck, R('2026-W42', 'ok', [A])])
    assert.equal(stuckView.run!.status, 'failed')
    assert.equal(stuckView.failedLatest, true)
    const fresh = { ...R('2026-W43', 'running', []), startedAt: new Date() }
    assert.equal(citationView([fresh]).run!.status, 'running')

    // I8: the email line only uses a run from this week or last week
    assert.equal(isRecentWeek('2026-W41', new Date('2026-10-12T04:00:00Z')), true) // Monday after a W41 Sunday run
    assert.equal(isRecentWeek('2026-W42', new Date('2026-10-12T04:00:00Z')), true)
    assert.equal(isRecentWeek('2026-W39', new Date('2026-10-12T04:00:00Z')), false)

    // I4: thinking tokens are billed as output
    assert.deepEqual(groundedUsage({ promptTokenCount: 8, candidatesTokenCount: 396, thoughtsTokenCount: 120 }), {
        inputTokens: 8,
        outputTokens: 516
    })
    assert.deepEqual(groundedUsage(undefined), { inputTokens: 0, outputTokens: 0 })

    // M1/M2: HTML entities decoded in titles and page text
    assert.equal(titleOf('<title>Best &#8211; Attar &amp; Oud&#039;s &quot;Top&quot;</title>'), `Best – Attar & Oud's "Top"`)
    assert.equal(titleOf(`<title>${'x'.repeat(300)}</title>`).length, 120)
    assert.ok(textOf('<p>Adil&nbsp;Qadri</p><script>Ajmal</script>').includes('Adil Qadri'))
    assert.ok(!textOf('<p>x</p><script>Ajmal</script>').includes('Ajmal'))

    // M3: own-site line counts distinct questions, never more than asked
    assert.deepEqual(
        ownSiteLine(
            [
                page({ type: 'own', domain: 'hasanoud.com', url: 'https://hasanoud.com/1', citedIn: ['q1', 'q2'] }),
                page({ type: 'own', domain: 'hasanoud.com', url: 'https://hasanoud.com/2', citedIn: ['q1'] })
            ],
            2
        ).own,
        2
    )

    console.log('citations checks passed')
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
