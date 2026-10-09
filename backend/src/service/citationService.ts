// Where AI reads (feature #9): which pages an AI search engine cites for a brand's buyer questions,
// and the outreach list of pages that name competitors but not the brand. One engine's view (Gemini + Google Search).
import { brandKey, nameMatcher } from './competitorService'
import type { PlanName } from '../config/planLimits'
import aiService from './aiService'
import { withAiCallContext } from './costLogService'
import brandModel from '../model/brandModel'
import orgModel from '../model/orgModel'
import mentionModel from '../model/mentionModel'
import citationRunModel from '../model/citationRunModel'
import { fetchPublicText } from '../util/publicUrl'
import { isoWeek } from '../util/isoWeek'
import logger from '../util/loger'
import type { ICitationRun } from '../types/citationTypes'

export type PageType = 'marketplace' | 'video' | 'own' | 'competitor' | 'article'

export interface ICitedPage {
    url: string
    domain: string
    title: string
    type: PageType
    citedIn: string[] // questions this page was a source for
    brands: string[] // tracked competitors found on the page
    brandFound: boolean // the brand itself is on the page
    readFrom: 'page' | 'answer' // page text, or the AI answer when the page couldn't be read
}

export const CITATION_QUESTIONS: Record<PlanName, number> = { free: 0, starter: 5, growth: 10, agency: 20 }

const MARKETPLACES = ['amazon', 'flipkart', 'nykaa', 'myntra', 'meesho', '1mg', 'jiomart', 'ajio', 'tatacliq', 'purplle', 'snapdeal']
const VIDEO = ['youtube.com', 'youtu.be']

// Questions where the latest scan named a tracked competitor and not the brand come first, then saved order
export const pickQuestions = (
    queries: string[],
    latest: Array<{ queryText: string; mentioned: boolean; brandsNamed?: Array<{ name: string }> }>,
    tracked: string[],
    limit: number
): string[] => {
    const keys = new Set(tracked.map(brandKey))
    const lost = new Set(latest.filter((m) => !m.mentioned && (m.brandsNamed || []).some((b) => keys.has(brandKey(b.name)))).map((m) => m.queryText))
    return [...queries.filter((q) => lost.has(q)), ...queries.filter((q) => !lost.has(q))].slice(0, limit)
}

// Same page however it was linked: no utm_* tracking and no #fragment
export const cleanUrl = (url: string): string => {
    try {
        const u = new URL(url)
        ;[...u.searchParams.keys()].filter((k) => k.toLowerCase().startsWith('utm_')).forEach((k) => u.searchParams.delete(k))
        u.hash = ''
        return u.toString().replace(/\?$/, '')
    } catch {
        return url
    }
}

// Hostname without "www."; '' when it isn't a web address
export const domainOf = (url: string): string => {
    try {
        const host = new URL(url.includes('://') ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, '')
        return host.includes('.') ? host : ''
    } catch {
        return ''
    }
}

const sameSite = (domain: string, site: string) => {
    const d = domainOf(site)
    return !!d && (domain === d || domain.endsWith(`.${d}`))
}

export const pageType = (url: string, ownSite: string, competitorSites: string[]): PageType => {
    const domain = domainOf(url)
    if (sameSite(domain, ownSite)) return 'own'
    if (competitorSites.some((s) => sameSite(domain, s))) return 'competitor'
    if (VIDEO.some((v) => domain === v || domain.endsWith(`.${v}`))) return 'video'
    if (domain.split('.').some((label) => MARKETPLACES.includes(label))) return 'marketplace'
    return 'article'
}

// Whole names, aliases and the no-space form ("AdilQadri"), so "Glow" is not found inside "Glowleaf"
export const brandsOnText = (text: string, names: Array<{ name: string; aliases?: string[] }>): string[] => {
    if (!text) return []
    return names
        .filter(({ name, aliases }) =>
            [name, ...(aliases || [])].some((n) => nameMatcher(n).test(text) || nameMatcher(n.replace(/\s+/g, '')).test(text))
        )
        .map((n) => n.name)
}

const TYPE_RANK: Record<PageType, number> = { article: 0, video: 0, marketplace: 1, own: 2, competitor: 2 }

export const buildOutreach = (pages: ICitedPage[], previousUrls: Set<string>) =>
    pages
        .filter((p) => p.brands.length > 0 && !p.brandFound && p.type !== 'own' && p.type !== 'competitor')
        .sort((a, b) => b.citedIn.length - a.citedIn.length || b.brands.length - a.brands.length || TYPE_RANK[a.type] - TYPE_RANK[b.type])
        .map((p) => ({
            ...p,
            isNew: !previousUrls.has(p.url),
            tip: p.type === 'marketplace' ? 'List your product here and collect reviews' : 'Reach out to be included'
        }))

export type IOutreachRow = ReturnType<typeof buildOutreach>[number]

export const topSources = (pages: ICitedPage[]) => {
    const counts = new Map<string, number>()
    for (const p of pages) counts.set(p.domain, (counts.get(p.domain) || 0) + p.citedIn.length)
    return [...counts.entries()]
        .map(([domain, count]) => ({ domain, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
}

// "Your site was cited in 0 of 10 answers; Ajmal's site: 3"
export const ownSiteLine = (pages: ICitedPage[], questions: number) => {
    const own = pages.filter((p) => p.type === 'own').reduce((n, p) => n + p.citedIn.length, 0)
    const byCompetitor = new Map<string, number>()
    for (const p of pages.filter((x) => x.type === 'competitor')) {
        const name = p.brands[0] || p.domain
        byCompetitor.set(name, (byCompetitor.get(name) || 0) + p.citedIn.length)
    }
    const best = [...byCompetitor.entries()].sort((a, b) => b[1] - a[1])[0]
    return { own, questions, topCompetitor: best ? { name: best[0], count: best[1] } : null }
}

// Monday email: the top target, a new one first
export const citationEmailLine = (outreach: IOutreachRow[]): string | null => {
    const top = outreach.find((p) => p.isNew) || outreach[0]
    if (!top) return null
    return `Top source to reach this week: ${top.domain} — ${top.title} (names ${top.brands.join(', ')}; not you)`
}

// What the page shows (runs newest first): the latest ok run; a failed or running latest falls back to the last
// ok one. "New" compares with the ok run before it, so the very first run marks nothing new.
export const citationView = (runs: ICitationRun[]) => {
    const latest = runs[0] ?? null
    const ok = runs.filter((r) => r.status === 'ok')
    const shown = latest?.status === 'ok' ? latest : (ok[0] ?? null)
    const prev = shown ? ok[ok.indexOf(shown) + 1] : undefined
    const pages = shown?.pages ?? []
    const prevUrls = prev ? new Set(buildOutreach(prev.pages, new Set()).map((p) => p.url)) : new Set(pages.map((p) => p.url))
    const outreach = buildOutreach(pages, prevUrls)
    const head = shown ?? latest
    return {
        run: head
            ? { week: head.week, status: latest!.status, checkedAt: head.finishedAt ?? head.startedAt, questions: head.questions.length }
            : null,
        failedLatest: latest?.status === 'failed' && !!shown,
        outreach,
        topSources: topSources(pages),
        ownSite: ownSiteLine(pages, shown ? shown.questions.filter((q) => q.ok).length : 0),
        counts: {
            questions: shown?.questions.length ?? 0,
            failed: shown?.questions.filter((q) => !q.ok).length ?? 0,
            pages: pages.length,
            read: pages.filter((p) => p.readFrom === 'page').length
        },
        newCount: outreach.filter((p) => p.isNew).length
    }
}

// ---- The weekly run ----------------------------------------------------------------------------

export interface ICitationDeps {
    grounded?: (prompt: string) => ReturnType<typeof aiService.callGeminiGrounded>
    resolve?: (uri: string) => Promise<string>
    fetchText?: (url: string) => Promise<string>
    now?: Date
}

const KEEP_RUNS = 8
const PAGE_UA = 'Mozilla/5.0 (compatible; SignalAI-Citations/1.0)'

// Gemini's source links are redirects; the Location header is the real page
const resolveRedirect = async (uri: string) => {
    try {
        const res = await fetch(uri, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5000) })
        return res.headers.get('location') || uri
    } catch {
        return uri
    }
}

const titleOf = (html: string) => (/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] || '').replace(/\s+/g, ' ').trim()
const textOf = (html: string) =>
    html
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')

export const runCitationScan = async (brandId: string, deps: ICitationDeps = {}): Promise<'ok' | 'failed' | 'skipped'> => {
    const grounded = deps.grounded ?? aiService.callGeminiGrounded
    const resolve = deps.resolve ?? resolveRedirect
    const fetchText = deps.fetchText ?? ((url: string) => fetchPublicText(url, { 'User-Agent': PAGE_UA }, 10000))
    const week = isoWeek(deps.now ?? new Date())

    const brand = await brandModel.findById(brandId).lean()
    if (!brand) return 'skipped'
    const org = await orgModel.findById(brand.orgId).select('plan').lean()
    const limit = CITATION_QUESTIONS[(org?.plan || 'free') as PlanName] ?? 0
    if (limit === 0) return 'skipped'
    if (await citationRunModel.exists({ brandId, week })) return 'skipped'

    let run
    try {
        run = await citationRunModel.create({ brandId, week, status: 'running', startedAt: new Date() })
    } catch {
        return 'skipped' // another worker started this week's run
    }

    try {
        const competitors = (brand.competitors || []).map((c) => ({ name: c.name, aliases: (c as { aliases?: string[] }).aliases }))
        const competitorSites = (brand.competitors || []).map((c) => (c as { website?: string }).website || '').filter(Boolean)
        const latest = brand.lastScanId
            ? await mentionModel.find({ brandId, scanId: brand.lastScanId }).select('queryText mentioned brandsNamed').lean()
            : []
        const questions = pickQuestions(
            (brand.queries || []).map((q) => q.text),
            latest,
            competitors.map((c) => c.name),
            limit
        )

        const pages = new Map<string, ICitedPage & { answer: string }>()
        const asked: Array<{ text: string; ok: boolean }> = []
        for (const q of questions) {
            const res = await withAiCallContext({ brandId, purpose: 'citations' }, () => grounded(q))
            asked.push({ text: q, ok: !!res })
            if (!res) continue
            const urls = await Promise.all(res.sources.map(async (s) => cleanUrl(await resolve(s.uri))))
            urls.forEach((url, i) => {
                const page = pages.get(url) ?? {
                    url,
                    domain: domainOf(url),
                    title: res.sources[i].title,
                    type: pageType(url, brand.website || '', competitorSites),
                    citedIn: [],
                    brands: [],
                    brandFound: false,
                    readFrom: 'page' as const,
                    answer: ''
                }
                if (!page.citedIn.includes(q)) page.citedIn.push(q)
                page.answer +=
                    ' ' +
                    res.supports
                        .filter((s) => s.chunks.includes(i))
                        .map((s) => s.text)
                        .join(' ')
                pages.set(url, page)
            })
        }

        // Each page once; one that can't be read is judged by the answer text it supported
        for (const page of pages.values()) {
            try {
                const html = await fetchText(page.url)
                page.title = titleOf(html) || page.title
                const text = textOf(html)
                page.brands = brandsOnText(text, competitors)
                page.brandFound = brandsOnText(text, [{ name: brand.name }]).length > 0
            } catch {
                page.readFrom = 'answer'
                page.brands = brandsOnText(page.answer, competitors)
                page.brandFound = brandsOnText(page.answer, [{ name: brand.name }]).length > 0
            }
        }

        const status = asked.some((a) => a.ok) ? 'ok' : 'failed'
        await citationRunModel.updateOne(
            { _id: run._id },
            { status, finishedAt: new Date(), questions: asked, pages: [...pages.values()].map(({ answer: _answer, ...p }) => p) }
        )
        const old = await citationRunModel.find({ brandId }).sort({ week: -1 }).skip(KEEP_RUNS).select('_id').lean()
        if (old.length) await citationRunModel.deleteMany({ _id: { $in: old.map((o) => o._id) } })
        return status
    } catch (err) {
        logger.error(`[Citations] Run for brand ${brandId} failed`, { meta: err })
        await citationRunModel.updateOne({ _id: run._id }, { status: 'failed', finishedAt: new Date() })
        return 'failed'
    }
}
