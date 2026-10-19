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
const LLMS_SITE_PAGES = 6
const LLMS_PRODUCTS = 3

// Menu and footer pages on the brand's own site (about, services, policies, contact), in page order
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
            if (!path || SKIP_PATH.test(path)) return
            links.add(url.origin + path)
        } catch {
            // malformed href
        }
    })
    return [...links]
}

// For an llms.txt: the homepage, its main site pages, and a few products when the brand sells them
export const llmsUrls = async (
    home: string,
    products: IBrandProduct[],
    sellsProducts: boolean,
    fetch: (url: string) => Promise<string> = fetchPage
) => {
    const html = await fetch(home).catch(() => '')
    const site = html ? siteLinks(html, home).slice(0, LLMS_SITE_PAGES) : []
    return [home, ...site, ...(sellsProducts ? wholeBrand(products, LLMS_PRODUCTS) : [])]
}
