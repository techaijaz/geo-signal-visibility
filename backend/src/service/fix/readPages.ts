import * as cheerio from 'cheerio'
import { fetchPublicText } from '../../util/publicUrl'
import { extractPageFacts } from '../aiViewService'
import { productLinksIn } from '../auditService'

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
