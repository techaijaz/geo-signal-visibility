// Where AI reads (feature #9): which pages an AI search engine cites for a brand's buyer questions,
// and the outreach list of pages that name competitors but not the brand. One engine's view (Gemini + Google Search).
import { brandKey, nameMatcher } from './competitorService'
import type { PlanName } from '../config/planLimits'

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
