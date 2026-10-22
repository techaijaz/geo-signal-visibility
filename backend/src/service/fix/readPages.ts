import * as cheerio from 'cheerio'
import { fetchPublicText } from '../../util/publicUrl'
import { extractPageFacts } from '../aiViewService'
import { productLinksIn } from '../auditService'
import { wholeBrand } from './pickPages'
import type { IBrandProduct } from '../../types/brandTypes'

const MAX_WORDS = 1500
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; SignalAI/1.0; +https://geosignalai.com)' }

export interface IPageText {
    url: string
    title: string
    price: string | null
    rating: string | null
    text: string
}

const fetchPage = (url: string) => fetchPublicText(url, UA, 10000)

// The page's own content (not menu, cart or footer), cut to ~1,500 words, plus the facts we already parse
export const pageText = (url: string, raw: string): IPageText => {
    // A space between tags, so "<p>₹799</p><p>4.6 out of 5</p>" doesn't read as one number "₹7994.6"
    const html = raw.replace(/></g, '> <')
    const facts = extractPageFacts(html)
    const $ = cheerio.load(html)
    $('script, style, noscript, template, svg, header, nav, footer, aside, [role="dialog"]').remove()
    const main = $('main, [role="main"]').first()
    const words = (main.length ? main : $('body')).text().replace(/\s+/g, ' ').trim().split(' ')
    return {
        url,
        title: facts.name || $('title').text().trim() || url,
        price: facts.price,
        rating: facts.rating,
        text: words.slice(0, MAX_WORDS).join(' ')
    }
}

export const readPages = async (urls: string[], fetch: (url: string) => Promise<string> = fetchPage) => {
    const pages: IPageText[] = []
    const read: Array<{ url: string; ok: boolean }> = []
    for (const url of urls) {
        try {
            pages.push(pageText(url, await fetch(url)))
            read.push({ url, ok: true })
        } catch {
            read.push({ url, ok: false })
        }
    }
    return { pages, read }
}

// For brands with no saved products: the homepage and product links found on it
export const homepageLinks = async (home: string, fetch: (url: string) => Promise<string> = fetchPage, max = 5) => {
    const html = await fetch(home).catch(() => '')
    return [home, ...(html ? productLinksIn(html, home).slice(0, max - 1) : [])]
}

// Pages that aren't content: accounts, carts, search, product pages (read separately) and files
const SKIP_PATH =
    /^\/(account|login|signin|sign-in|register|signup|cart|checkout|search|wishlist|products?)(\/|$)|\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|docx?|xlsx?)$/i
// A language switch (/en, /hi-in) is the same site again
const LOCALE_PATH = /^\/[a-z]{2}(-[a-z]{2})?$/i
// Pages an llms.txt should link first; category and blog lists last, so the footer isn't crowded out by the menu
const KEY_PATH = /about|contact|polic|shipping|delivery|refund|return|terms|privacy|service|faq|treatment|pricing/i
const LIST_PATH = /^\/(collections|blogs?|category|tag)(\/|$)/i
const rank = (path: string) => (KEY_PATH.test(path) ? 0 : LIST_PATH.test(path) ? 2 : 1)
const LLMS_SITE_PAGES = 6
const LLMS_PRODUCTS = 3

// Menu and footer pages on the brand's own site: about, services, policies and contact first, then page order
export const siteLinks = (html: string, home: string): string[] => {
    const bare = (h: string) => h.replace(/^www\./, '')
    const host = bare(new URL(home).hostname)
    const links = new Set<string>()
    const $ = cheerio.load(html)
    $('a[href]').each((_, el) => {
        try {
            const url = new URL($(el).attr('href') || '', home)
            if (!/^https?:$/.test(url.protocol) || bare(url.hostname) !== host) return
            const path = url.pathname.replace(/\/$/, '')
            if (!path || SKIP_PATH.test(path) || LOCALE_PATH.test(path)) return
            links.add(url.origin + path)
        } catch {
            // malformed href
        }
    })
    return [...links].sort((x, y) => rank(new URL(x).pathname) - rank(new URL(y).pathname))
}

// One about, one contact and one policy page (the shortest address of each), so many service or category
// pages can't crowd them out; the other slots go to the rest in rank order
const INFO_GROUPS = [/about/i, /contact/i, /polic|privacy|terms|refund|return|shipping|delivery/i]
const llmsSitePages = (links: string[]) => {
    const pathOf = (u: string) => new URL(u).pathname
    const info = INFO_GROUPS.map((re) =>
        links.filter((u) => re.test(pathOf(u))).reduce<string | null>((best, u) => (!best || pathOf(u).length < pathOf(best).length ? u : best), null)
    )
    const chosen = new Set(info.filter((u): u is string => !!u))
    const infoInOrder = links.filter((u) => chosen.has(u))
    const rest = links.filter((u) => !chosen.has(u) && !INFO_GROUPS.some((re) => re.test(pathOf(u))))
    return [...infoInOrder, ...rest].slice(0, LLMS_SITE_PAGES)
}

// For an llms.txt: the homepage, its main site pages, and a few products when the brand sells them
export const llmsUrls = async (
    home: string,
    products: IBrandProduct[],
    sellsProducts: boolean,
    fetch: (url: string) => Promise<string> = fetchPage
) => {
    const html = await fetch(home).catch(() => '')
    const site = html ? llmsSitePages(siteLinks(html, home)) : []
    return [home, ...site, ...(sellsProducts ? wholeBrand(products, LLMS_PRODUCTS) : [])]
}
