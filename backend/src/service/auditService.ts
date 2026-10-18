import axios from 'axios'
import * as cheerio from 'cheerio'
import auditModel from '../model/auditModel'
import brandModel from '../model/brandModel'
import mentionModel from '../model/mentionModel'
import recommendationModel from '../model/recommendationModel'
import { isResolvedByAudit } from './recommendationService'
import { markVerified, recordDone } from './fixEventService'
import { assertPublicUrl, publicAxiosOptions } from '../util/publicUrl'
import { IAuditGridItem } from '../types/auditTypes'
import logger from '../util/loger'
import type { IFeedHealth, keepSavedFeed } from './feedHealthService'
import { siteProfile, type ISiteProfile } from './siteProfile'

export const faqIssueText = (profile: ISiteProfile) =>
    `FAQPage schema missing on homepage and ${profile.pagesWord} (Limits direct AI answers and search snippet citations)`
// Product page audit and feed check: only for sites that sell products, and only when the homepage opened
export const shouldRunProductChecks = (fetchSuccess: boolean, profile: ISiteProfile) => fetchSuccess && profile.sellsProducts
export const entitySchemaLabel = (profile: ISiteProfile) =>
    ({
        shop: 'Product / Brand schema',
        service: 'Service / ProfessionalService schema',
        local: 'LocalBusiness schema',
        saas: 'SoftwareApplication schema',
        media: 'Article / NewsArticle schema'
    })[profile.type]
// LocalBusiness and its common subtypes (Dentist, MedicalClinic, LegalService…) are the business schema for service
// and local sites; a stray Product schema there is not
const LOCAL_SCHEMA =
    /service|localbusiness|dentist|medical|clinic|physician|hospital|legal|attorney|accounting|realestate|store|restaurant|lodging|beauty/
export const hasEntitySchema = (types: string[], profile: ISiteProfile) =>
    profile.type === 'service' || profile.type === 'local'
        ? types.some((s) => LOCAL_SCHEMA.test(s))
        : types.some(
              (s) =>
                  s.includes('product') ||
                  s.includes('softwareapplication') ||
                  s.includes('service') ||
                  s.includes('article') ||
                  s.includes('localbusiness')
          )
export const listingsEmptyName = (profile: ISiteProfile) => (profile.sellsProducts ? 'Marketplace & Sales Channels' : 'Listings & directories')

// Sales channels, B2B listings, software and local directories linked from the homepage (first matches kept in order)
const PLATFORM_LINKS: Array<[RegExp, string]> = [
    [/indiamart\.com/, 'IndiaMART B2B Listing'],
    [/tradeindia\.com/, 'TradeIndia B2B Listing'],
    [/exportersindia\.com/, 'ExportersIndia Profile'],
    [/amazon\./, 'Amazon Store'],
    [/flipkart\./, 'Flipkart Store'],
    [/meesho\./, 'Meesho Store'],
    [/jiomart\.com/, 'JioMart Store'],
    [/nykaa\./, 'Nykaa Store'],
    [/myntra\./, 'Myntra Store'],
    [/shopify\./, 'Shopify Store'],
    [/etsy\./, 'Etsy Store'],
    [/blinkit\.com/, 'Blinkit Listing'],
    [/zepto/, 'Zepto Listing'],
    [/g2\.com/, 'G2 Directory Profile'],
    [/capterra\.com/, 'Capterra Profile'],
    [/trustpilot\.com/, 'Trustpilot Profile'],
    [/producthunt\.com/, 'ProductHunt Profile'],
    [/justdial\.com/, 'Justdial Listing'],
    [/practo\.com/, 'Practo Profile'],
    [/sulekha\.com/, 'Sulekha Listing'],
    [/g\.page\/|maps\.app\.goo\.gl|google\.[a-z.]+\/maps/, 'Google Business Profile']
]
export const platformsIn = (href: string): string[] => {
    const h = href.toLowerCase()
    return PLATFORM_LINKS.filter(([re]) => re.test(h)).map(([, name]) => name)
}

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GEOAudit/1.0'
const PRODUCT_PAGES_TO_CHECK = 3

// Lower-cased schema.org types from JSON-LD at any depth (Product > aggregateRating, @graph, arrays)
// and microdata itemtypes
export const schemaTypesIn = (html: string): string[] => {
    const $ = cheerio.load(html)
    const types: string[] = []
    const push = (t: unknown) => {
        for (const v of Array.isArray(t) ? t : [t]) if (typeof v === 'string') types.push(v.toLowerCase())
    }
    const walk = (node: unknown): void => {
        if (Array.isArray(node)) return node.forEach(walk)
        if (!node || typeof node !== 'object') return
        push((node as Record<string, unknown>)['@type'])
        Object.values(node).forEach(walk)
    }
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            walk(JSON.parse($(el).html() || '{}'))
        } catch {
            // invalid JSON-LD script
        }
    })
    $('[itemtype]').each((_, el) => push($(el).attr('itemtype')))
    return types
}

// Same-site product links on the homepage (Shopify /products/, WooCommerce /product/): product schema
// usually lives there, not on the homepage.
// ponytail: homepage links only; read sitemap.xml if stores without product links on the homepage show up
export const productLinksIn = (html: string, siteUrl: string): string[] => {
    const host = new URL(siteUrl).hostname
    const $ = cheerio.load(html)
    const links = new Set<string>()
    $('a[href]').each((_, el) => {
        try {
            const url = new URL($(el).attr('href') || '', siteUrl)
            if (url.hostname === host && /\/products?\/[^/]+/.test(url.pathname)) links.add(url.origin + url.pathname)
        } catch {
            // malformed href
        }
    })
    return [...links].slice(0, PRODUCT_PAGES_TO_CHECK)
}

export const auditService = {
    /**
     * Helper to sanitize domain URL
     */
    cleanUrl: (urlStr: string): string => {
        let clean = urlStr.trim()
        if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
            clean = `https://${clean}`
        }
        // remove trailing slash
        return clean.replace(/\/$/, '')
    },

    /**
     * Parse robots.txt rules for a specific AI agent user-agent
     */
    checkBotAccessInRobotsTxt: (robotsContent: string, botId: string): 'Allowed' | 'Blocked' => {
        if (!robotsContent.trim()) return 'Allowed'

        const lines = robotsContent.split(/\r?\n/)
        let currentAgents: string[] = []
        let globalDisallowAll = false
        let botSpecificDisallow = false
        let botSpecificAllow = false

        for (const rawLine of lines) {
            const line = rawLine.trim()
            if (!line || line.startsWith('#')) continue

            const colonIdx = line.indexOf(':')
            if (colonIdx === -1) continue

            const key = line.substring(0, colonIdx).trim().toLowerCase()
            const val = line
                .substring(colonIdx + 1)
                .trim()
                .toLowerCase()

            if (key === 'user-agent') {
                if (currentAgents.length > 0 && !key.startsWith('disallow') && !key.startsWith('allow')) {
                    currentAgents = []
                }
                currentAgents.push(val)
            } else if (key === 'disallow') {
                if (val === '/' || val === '/*') {
                    if (currentAgents.includes('*')) {
                        globalDisallowAll = true
                    }
                    if (currentAgents.some((a) => a.includes(botId))) {
                        botSpecificDisallow = true
                    }
                }
            } else if (key === 'allow') {
                if (val === '/' || val === '/*') {
                    if (currentAgents.some((a) => a.includes(botId))) {
                        botSpecificAllow = true
                    }
                }
            }
        }

        if (botSpecificAllow) return 'Allowed'
        if (botSpecificDisallow) return 'Blocked'
        if (globalDisallowAll) return 'Blocked'

        return 'Allowed'
    },

    /**
     * Real scan of a brand's website and online signals
     */
    runRealAudit: async (brandId: string) => {
        const brand = await brandModel.findById(brandId)
        if (!brand) {
            throw new Error(`Brand not found with ID: ${brandId}`)
        }
        const profile = siteProfile(brand)

        const rawUrl = brand.website
        const targetUrl = auditService.cleanUrl(rawUrl)
        let domainHost = ''
        try {
            domainHost = new URL(targetUrl).hostname
        } catch {
            domainHost = rawUrl
        }

        logger.info(`Starting real website audit for brand ${brand.name} at ${targetUrl}`)

        // 0. SSL / HTTPS Security Validation (Strict Gate: Halt scan if insecure)
        let isHttpsSecure = false
        let sslErrorMsg = ''
        // No answer at all (DNS, refused, timeout) is a dead address, not a missing certificate
        let unreachable = false

        // Check if rawUrl is explicitly http:// or test https connection
        if (rawUrl.trim().toLowerCase().startsWith('http://')) {
            isHttpsSecure = false
            sslErrorMsg = 'Served over unencrypted http://'
        } else {
            try {
                // An IP inside our network never reaches the agents' name check
                await assertPublicUrl(targetUrl)
                const httpsUrl = `https://${domainHost}`
                const sslTest = await axios.get(httpsUrl, {
                    ...publicAxiosOptions,
                    timeout: 6000,
                    maxRedirects: 5,
                    headers: { 'User-Agent': BROWSER_UA }
                })
                if (sslTest.status === 200 || sslTest.status === 301 || sslTest.status === 302) {
                    isHttpsSecure = true
                }
            } catch (err: unknown) {
                isHttpsSecure = false
                const error = err as { code?: string; message?: string; response?: unknown }
                // Any HTTP answer (403 from bot protection, 404, 500) means HTTPS itself works
                if (error.response) isHttpsSecure = true
                sslErrorMsg = error.code || error.message || 'SSL handshake failed'
                unreachable = !error.response && !/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO/i.test(sslErrorMsg)
            }
        }

        // STRICT GATE: If website is not secure, DO NOT SCAN FURTHER!
        if (!isHttpsSecure) {
            logger.warn(`Scan aborted for brand ${brand.name} (${domainHost}) - ${unreachable ? 'unreachable' : 'not secure'} (${sslErrorMsg})`)

            const blockedHoldingBack = [
                unreachable
                    ? `WEBSITE UNREACHABLE: ${domainHost} could not be opened (${sslErrorMsg}). Check the website address in Settings → Brand; the audit runs once the site opens.`
                    : `CRITICAL SECURITY BLOCKER: Website is not secure (${sslErrorMsg}). Scan halted immediately - SSL/HTTPS encryption is mandatory for AI engines and search crawlers.`
            ]

            const blockedCrawlerAccess: IAuditGridItem[] = [
                { name: 'SSL / HTTPS Security', status: unreachable ? 'Unreachable' : 'Insecure (HTTP/SSL)', badgeType: 'badge-bad' },
                { name: 'GPTBot (OpenAI)', status: 'Scan Aborted', badgeType: 'badge-bad' },
                { name: 'ClaudeBot (Anthropic)', status: 'Scan Aborted', badgeType: 'badge-bad' },
                { name: 'Google-Extended (Gemini)', status: 'Scan Aborted', badgeType: 'badge-bad' },
                { name: 'PerplexityBot', status: 'Scan Aborted', badgeType: 'badge-bad' },
                { name: 'Bytespider (TikTok AI)', status: 'Scan Aborted', badgeType: 'badge-bad' },
                { name: 'llms.txt file', status: 'Scan Aborted', badgeType: 'badge-bad' }
            ]

            const blockedStructuredData: IAuditGridItem[] = [
                { name: 'Organization schema', status: 'Scan Aborted', badgeType: 'badge-bad' },
                { name: entitySchemaLabel(profile), status: 'Scan Aborted', badgeType: 'badge-bad' },
                { name: 'FAQPage schema', status: 'Scan Aborted', badgeType: 'badge-bad' },
                { name: 'Review / Rating schema', status: 'Scan Aborted', badgeType: 'badge-bad' }
            ]

            const blockedOffSite: IAuditGridItem[] = [
                { name: 'Search Indexing', status: unreachable ? 'Unreachable' : 'Blocked (Insecure)', badgeType: 'badge-bad' },
                { name: 'Social / Brand Links', status: 'Scan Aborted', badgeType: 'badge-bad' },
                { name: 'Wikipedia presence', status: 'Scan Aborted', badgeType: 'badge-bad' }
            ]

            const blockedMarketplace: IAuditGridItem[] = [
                { name: 'Marketplace / Directory Readability', status: 'Scan Aborted', badgeType: 'badge-bad' }
            ]

            const existingAudit = await auditModel.findOne({ brandId })
            if (existingAudit) {
                existingAudit.healthScore = 0
                existingAudit.holdingBack = blockedHoldingBack
                existingAudit.crawlerAccess = blockedCrawlerAccess
                existingAudit.structuredData = blockedStructuredData
                existingAudit.offSiteFootprint = blockedOffSite
                existingAudit.marketplaceReadability = blockedMarketplace
                existingAudit.lastAuditedAt = new Date()
                await existingAudit.save()
                return existingAudit
            }

            return auditModel.create({
                brandId,
                healthScore: 0,
                holdingBack: blockedHoldingBack,
                crawlerAccess: blockedCrawlerAccess,
                structuredData: blockedStructuredData,
                offSiteFootprint: blockedOffSite,
                marketplaceReadability: blockedMarketplace,
                lastAuditedAt: new Date()
            })
        }

        // 1. Crawler Access Checks (robots.txt & llms.txt)
        const crawlerAccess: IAuditGridItem[] = []

        // Add Security Badge as first item in Crawler Access Grid
        crawlerAccess.push({
            name: 'SSL / HTTPS Security',
            status: isHttpsSecure ? 'Secure (HTTPS)' : 'Insecure (HTTP/SSL)',
            badgeType: isHttpsSecure ? 'badge-ok' : 'badge-bad'
        })

        let robotsTxtContent = ''
        let llmsTxtFound = false

        try {
            const robotsRes = await axios.get(`${targetUrl}/robots.txt`, {
                ...publicAxiosOptions,
                timeout: 6000,
                headers: { 'User-Agent': BROWSER_UA },
                validateStatus: (status) => status < 500
            })
            if (robotsRes.status === 200 && typeof robotsRes.data === 'string') {
                robotsTxtContent = robotsRes.data.toLowerCase()
            }
        } catch (err: unknown) {
            const error = err as Error
            logger.warn(`robots.txt fetch failed for ${targetUrl}: ${error.message}`)
        }

        // Check specific AI crawlers in robots.txt using accurate parser
        const aiAgents = [
            { id: 'gptbot', name: 'GPTBot (OpenAI)' },
            { id: 'claudebot', name: 'ClaudeBot (Anthropic)' },
            { id: 'google-extended', name: 'Google-Extended (Gemini)' },
            { id: 'perplexitybot', name: 'PerplexityBot' },
            { id: 'bytespider', name: 'Bytespider (TikTok AI)' }
        ]

        for (const agent of aiAgents) {
            const status = auditService.checkBotAccessInRobotsTxt(robotsTxtContent, agent.id)
            crawlerAccess.push({
                name: agent.name,
                status: status,
                badgeType: status === 'Allowed' ? 'badge-ok' : 'badge-bad'
            })
        }

        // Check llms.txt standard
        try {
            const llmsRes = await axios.get(`${targetUrl}/llms.txt`, {
                ...publicAxiosOptions,
                timeout: 5000,
                validateStatus: (status) => status === 200
            })
            if (llmsRes.status === 200) {
                llmsTxtFound = true
                crawlerAccess.push({ name: 'llms.txt file', status: 'Found (Standard)', badgeType: 'badge-ok' })
            } else {
                crawlerAccess.push({ name: 'llms.txt file', status: 'Not found', badgeType: 'badge-warn' })
            }
        } catch {
            crawlerAccess.push({ name: 'llms.txt file', status: 'Not found', badgeType: 'badge-warn' })
        }

        // 2. Fetch Homepage HTML & Parse Schemas / SEO tags
        const structuredData: IAuditGridItem[] = []
        const htmlIssues: string[] = []
        let htmlContent = ''
        let fetchSuccess = false
        let hasDocsLink = false
        let hasApiLink = false
        const detectedPlatforms: { name: string; url: string }[] = []

        try {
            const htmlRes = await axios.get(targetUrl, {
                ...publicAxiosOptions,
                timeout: 8000,
                headers: { 'User-Agent': BROWSER_UA }
            })
            if (htmlRes.status === 200) {
                htmlContent = htmlRes.data
                fetchSuccess = true
            }
        } catch (err: unknown) {
            const error = err as Error
            logger.error(`Failed to fetch HTML for ${targetUrl}: ${error.message}`)
            htmlIssues.push(`Unable to fetch website content directly from ${domainHost} (${error.message})`)
        }

        if (fetchSuccess && htmlContent) {
            const $ = cheerio.load(htmlContent)

            // Schema found on the homepage or on any of its first few product pages counts
            const productPages = await Promise.all(
                productLinksIn(htmlContent, targetUrl).map((url) =>
                    axios
                        .get<string>(url, { ...publicAxiosOptions, timeout: 8000, headers: { 'User-Agent': BROWSER_UA }, responseType: 'text' })
                        .then((res) => res.data)
                        .catch(() => '')
                )
            )
            const foundSchemas = [htmlContent, ...productPages].flatMap((html) => (html ? schemaTypesIn(html) : []))

            // Check key schemas for GEO & Search Indexing
            const hasOrgSchema = foundSchemas.some(
                (s) => s.includes('organization') || s.includes('brand') || s.includes('corporation') || s.includes('localbusiness')
            )
            const hasWebSiteSchema = foundSchemas.some(
                (s) => s.includes('website') || s.includes('sitenavigationelement') || s.includes('breadcrumblist')
            )
            const hasProductOrServiceSchema = hasEntitySchema(foundSchemas, profile)
            const hasFaqSchema = foundSchemas.some((s) => s.includes('faqpage') || s.includes('question'))
            const hasReviewSchema = foundSchemas.some((s) => s.includes('review') || s.includes('aggregaterating'))

            const schemaLabel = entitySchemaLabel(profile)

            structuredData.push({
                name: 'Organization / Brand schema',
                status: hasOrgSchema ? 'Found (Valid)' : 'Missing',
                badgeType: hasOrgSchema ? 'badge-ok' : 'badge-bad'
            })
            structuredData.push({
                name: 'WebSite / Breadcrumb schema',
                status: hasWebSiteSchema ? 'Found' : 'Missing',
                badgeType: hasWebSiteSchema ? 'badge-ok' : 'badge-warn'
            })
            structuredData.push({
                name: schemaLabel,
                status: hasProductOrServiceSchema ? 'Found' : 'Missing',
                badgeType: hasProductOrServiceSchema ? 'badge-ok' : 'badge-warn'
            })
            structuredData.push({
                name: 'FAQPage schema',
                status: hasFaqSchema ? 'Found' : 'Missing',
                badgeType: hasFaqSchema ? 'badge-ok' : 'badge-bad'
            })
            structuredData.push({
                name: 'Review / Rating schema',
                status: hasReviewSchema ? 'Found' : 'Missing',
                badgeType: hasReviewSchema ? 'badge-ok' : 'badge-warn'
            })

            if (!hasOrgSchema) {
                htmlIssues.push('Organization/Brand JSON-LD schema missing (AI models cannot verify official brand identity)')
            }
            if (!hasFaqSchema) {
                htmlIssues.push(faqIssueText(profile))
            }
            if (!hasProductOrServiceSchema && !hasWebSiteSchema) {
                htmlIssues.push(`No ${schemaLabel} or WebSite Schema.org markup detected`)
            }

            // Extract social, brand, and marketplace/directory links
            const socialLinksFound: string[] = []

            $('a[href]').each((_, el) => {
                const href = ($(el).attr('href') || '').trim()
                const lowerHref = href.toLowerCase()

                if (lowerHref.includes('linkedin.com')) socialLinksFound.push('LinkedIn')
                if (lowerHref.includes('twitter.com') || lowerHref.includes('x.com')) socialLinksFound.push('Twitter/X')
                if (lowerHref.includes('github.com')) socialLinksFound.push('GitHub')
                if (lowerHref.includes('youtube.com')) socialLinksFound.push('YouTube')
                if (lowerHref.includes('instagram.com')) socialLinksFound.push('Instagram')
                if (lowerHref.includes('facebook.com')) socialLinksFound.push('Facebook')
                if (lowerHref.includes('reddit.com')) socialLinksFound.push('Reddit')

                if (
                    lowerHref.includes('/docs') ||
                    lowerHref.includes('docs.') ||
                    lowerHref.includes('/documentation') ||
                    lowerHref.includes('/help') ||
                    lowerHref.includes('/developer')
                ) {
                    hasDocsLink = true
                }
                if (lowerHref.includes('/api') || lowerHref.includes('api.')) {
                    hasApiLink = true
                }

                // Detect external sales, B2B & review platforms
                for (const name of platformsIn(href)) detectedPlatforms.push({ name, url: href })
            })
            const uniqueSocials = Array.from(new Set(socialLinksFound))

            // HTML Tags check
            const h1Count = $('h1').length
            const metaCanonical = $('link[rel="canonical"]').attr('href')
            const metaDescription = $('meta[name="description"]').attr('content')

            if (h1Count === 0) {
                htmlIssues.push('No <h1> heading tag found on homepage')
            }
            if (!metaCanonical) {
                htmlIssues.push('Canonical URL tag missing')
            }
            if (!metaDescription) {
                htmlIssues.push('Meta description tag missing on homepage')
            }
            if (uniqueSocials.length === 0) {
                htmlIssues.push('No official social links (LinkedIn, X/Twitter, GitHub) found on homepage footer/header')
            }
        } else {
            // Default structure if site unreachable
            structuredData.push(
                { name: 'Organization schema', status: 'Unchecked', badgeType: 'badge-bad' },
                { name: entitySchemaLabel(profile), status: 'Unchecked', badgeType: 'badge-warn' },
                { name: 'FAQPage schema', status: 'Unchecked', badgeType: 'badge-bad' },
                { name: 'Review / Rating schema', status: 'Unchecked', badgeType: 'badge-warn' }
            )
        }

        // 3. Off-Site Footprint & Wikipedia Check
        let wikipediaFound = false
        try {
            const wikiRes = await axios.get('https://en.wikipedia.org/w/api.php', {
                params: {
                    action: 'query',
                    list: 'search',
                    srsearch: brand.name,
                    format: 'json'
                },
                timeout: 4000
            })
            const searchResults = wikiRes.data?.query?.search || []
            if (searchResults.length > 0) {
                const topTitle = String(searchResults[0].title).toLowerCase()
                if (topTitle.includes(brand.name.toLowerCase())) {
                    wikipediaFound = true
                }
            }
        } catch {
            // wikipedia lookup silent fail
        }

        // AI Mentions footprint check in GEO DB
        const dbMentionsCount = await mentionModel.countDocuments(brand.lastScanId ? { brandId, scanId: brand.lastScanId } : { brandId })

        const offSiteFootprint: IAuditGridItem[] = [
            {
                name: 'Search Indexing Status',
                status: fetchSuccess ? 'Indexed (HTTP 200)' : 'Unreachable Domain',
                badgeType: fetchSuccess ? 'badge-ok' : 'badge-bad'
            },
            {
                name: 'AI Mentions Footprint',
                status: dbMentionsCount > 0 ? `${dbMentionsCount} AI Mentions Tracked` : 'No AI Mentions Logged',
                badgeType: dbMentionsCount > 0 ? 'badge-ok' : 'badge-warn'
            },
            {
                name: 'Wikipedia Entity Presence',
                status: wikipediaFound ? 'Entity Match Found' : 'Not Found',
                badgeType: wikipediaFound ? 'badge-ok' : 'badge-warn'
            }
        ]

        // 4. Marketplace & Sales Platform Readability (User-Specific Platform Detection)
        const marketplaceReadability: IAuditGridItem[] = []
        const uniquePlatforms = Array.from(new Map(detectedPlatforms.map((p) => [p.name, p])).values())

        if (uniquePlatforms.length > 0) {
            uniquePlatforms.forEach((p) => {
                marketplaceReadability.push({
                    name: `${p.name} Listing Readability`,
                    status: 'Linked & AI Readable',
                    badgeType: 'badge-ok'
                })
            })
            marketplaceReadability.push({
                name: profile.sellsProducts ? 'Structured Product Schema' : 'Structured data for listings',
                status: fetchSuccess ? 'Available for Crawlers' : 'Check Meta Tags',
                badgeType: fetchSuccess ? 'badge-ok' : 'badge-warn'
            })
        }

        if (hasDocsLink) {
            marketplaceReadability.push({
                name: 'Technical Documentation',
                status: 'Accessible (/docs)',
                badgeType: 'badge-ok'
            })
        }

        if (hasApiLink) {
            marketplaceReadability.push({
                name: 'API Reference',
                status: 'Accessible (/api)',
                badgeType: 'badge-ok'
            })
        }

        if (marketplaceReadability.length === 0) {
            marketplaceReadability.push({
                name: listingsEmptyName(profile),
                status: 'No External Platforms Linked',
                badgeType: 'badge-warn'
            })
        }

        // Compile "What's holding you back" (List of failed or warning checks)
        const holdingBack: string[] = [...htmlIssues]

        // Add blocked crawlers to holdingBack
        const blockedCrawlers = crawlerAccess.filter((c) => c.status === 'Blocked').map((c) => `${c.name} crawler currently blocked in robots.txt`)
        holdingBack.push(...blockedCrawlers)

        if (!llmsTxtFound) {
            holdingBack.push('No llms.txt standard file found for AI model scrapers')
        }

        // Calculate dynamic Health Score (0 - 100)
        const allItems = [...crawlerAccess, ...structuredData, ...offSiteFootprint, ...marketplaceReadability]
        const passedCount = allItems.filter((i) => i.badgeType === 'badge-ok').length
        const totalItems = allItems.length
        let healthScore = totalItems > 0 ? Math.round((passedCount / totalItems) * 100) : 50

        // If website fetch failed, deduct penalty
        if (!fetchSuccess) {
            healthScore = Math.max(10, healthScore - 25)
        }

        // Product and collection pages; never fails the audit
        let storeAudit: unknown = undefined
        // Not when the homepage couldn't be opened: every page would time out against a dead site
        // Product feed health (catalogue data); also never fails the audit
        let feedHealth: IFeedHealth | undefined = undefined
        let keepSaved: typeof keepSavedFeed | undefined = undefined
        if (shouldRunProductChecks(fetchSuccess, profile)) {
            try {
                const { storeAuditForBrand } = await import('./storeAuditService')
                storeAudit = await storeAuditForBrand(brand)
            } catch (err) {
                logger.warn(`[auditService] Store audit failed for brand ${brandId}`, { meta: err })
            }
            try {
                const feed = await import('./feedHealthService')
                feedHealth = await feed.runFeedHealth(brand.website)
                keepSaved = feed.keepSavedFeed
            } catch (err) {
                logger.warn(`[auditService] Feed health failed for brand ${brandId}`, { meta: err })
            }
        }

        // Shopify store: the fix guides show Shopify steps (a homepage that failed to load keeps the last answer)
        const { shopifyFlag } = await import('./aiViewService')
        // Update or recreate audit in database
        const existingAudit = await auditModel.findOne({ brandId })
        const isShopify = shopifyFlag(existingAudit?.isShopify, htmlContent)
        if (existingAudit) {
            if (storeAudit !== undefined) existingAudit.storeAudit = storeAudit
            // A store blip doesn't replace the last good feed result
            if (feedHealth !== undefined && !keepSaved?.(existingAudit.feedHealth as IFeedHealth | null, feedHealth))
                existingAudit.feedHealth = feedHealth
            existingAudit.healthScore = healthScore
            existingAudit.isShopify = isShopify
            existingAudit.holdingBack = holdingBack
            existingAudit.crawlerAccess = crawlerAccess
            existingAudit.structuredData = structuredData
            existingAudit.offSiteFootprint = offSiteFootprint
            existingAudit.marketplaceReadability = marketplaceReadability
            existingAudit.lastAuditedAt = new Date()
            await existingAudit.save()
        }
        const saved =
            existingAudit ??
            (await auditModel.create({
                brandId,
                healthScore,
                isShopify,
                holdingBack,
                crawlerAccess,
                structuredData,
                offSiteFootprint,
                marketplaceReadability,
                ...(storeAudit !== undefined ? { storeAudit } : {}),
                ...(feedHealth !== undefined ? { feedHealth } : {}),
                lastAuditedAt: new Date()
            }))

        // Only after the audit is saved, so the page never shows "Checking" next to work it already ticked
        // Recommendations made before this audit (or against an older one) may ask for things now in place
        const stale = await recommendationModel
            .find({ brandId, isCompleted: { $ne: true } })
            .select('brandId text category')
            .lean()
        const resolved = stale.filter((r) => isResolvedByAudit(r.text, { brandId, healthScore, crawlerAccess, structuredData }))
        if (resolved.length > 0) {
            await recommendationModel.updateMany({ _id: { $in: resolved.map((r) => r._id) } }, { isCompleted: true })
            for (const r of resolved) await recordDone(r, 'audit')
        }
        // Work the user already ticked that the audit now confirms
        const ticked = await recommendationModel.find({ brandId, isCompleted: true }).select('text').lean()
        await markVerified(
            String(brandId),
            ticked.filter((r) => isResolvedByAudit(r.text, { brandId, healthScore, crawlerAccess, structuredData })).map((r) => r._id)
        )

        return saved
    }
}
