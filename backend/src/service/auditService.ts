import axios from 'axios'
import * as cheerio from 'cheerio'
import auditModel from '../model/auditModel'
import brandModel from '../model/brandModel'
import mentionModel from '../model/mentionModel'
import { IAuditGridItem } from '../types/auditTypes'
import logger from '../util/loger'

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
            const val = line.substring(colonIdx + 1).trim().toLowerCase()

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
                    if (currentAgents.some(a => a.includes(botId))) {
                        botSpecificDisallow = true
                    }
                }
            } else if (key === 'allow') {
                if (val === '/' || val === '/*') {
                    if (currentAgents.some(a => a.includes(botId))) {
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

        // Check if rawUrl is explicitly http:// or test https connection
        if (rawUrl.trim().toLowerCase().startsWith('http://')) {
            isHttpsSecure = false
            sslErrorMsg = 'Served over unencrypted http://'
        } else {
            try {
                const httpsUrl = `https://${domainHost}`
                const sslTest = await axios.get(httpsUrl, {
                    timeout: 6000,
                    maxRedirects: 5,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GEOAudit/1.0' }
                })
                if (sslTest.status === 200 || sslTest.status === 301 || sslTest.status === 302) {
                    isHttpsSecure = true
                }
            } catch (err: unknown) {
                isHttpsSecure = false
                const error = err as { code?: string; message?: string }
                sslErrorMsg = error.code || error.message || 'SSL handshake failed'
            }
        }

        // STRICT GATE: If website is not secure, DO NOT SCAN FURTHER!
        if (!isHttpsSecure) {
            logger.warn(`Scan aborted for brand ${brand.name} (${domainHost}) - Website is not secure (${sslErrorMsg})`)

            const blockedHoldingBack = [
                `CRITICAL SECURITY BLOCKER: Website is not secure (${sslErrorMsg}). Scan halted immediately - SSL/HTTPS encryption is mandatory for AI engines and search crawlers.`
            ]

            const blockedCrawlerAccess: IAuditGridItem[] = [
                { name: 'SSL / HTTPS Security', status: 'Insecure (HTTP/SSL)', badgeType: 'badge-bad' },
                { name: 'GPTBot (OpenAI)', status: 'Scan Aborted', badgeType: 'badge-bad' },
                { name: 'ClaudeBot (Anthropic)', status: 'Scan Aborted', badgeType: 'badge-bad' },
                { name: 'Google-Extended (Gemini)', status: 'Scan Aborted', badgeType: 'badge-bad' },
                { name: 'PerplexityBot', status: 'Scan Aborted', badgeType: 'badge-bad' },
                { name: 'Bytespider (TikTok AI)', status: 'Scan Aborted', badgeType: 'badge-bad' },
                { name: 'llms.txt file', status: 'Scan Aborted', badgeType: 'badge-bad' }
            ]

            const blockedStructuredData: IAuditGridItem[] = [
                { name: 'Organization schema', status: 'Scan Aborted', badgeType: 'badge-bad' },
                { name: 'Product / App schema', status: 'Scan Aborted', badgeType: 'badge-bad' },
                { name: 'FAQPage schema', status: 'Scan Aborted', badgeType: 'badge-bad' },
                { name: 'Review / Rating schema', status: 'Scan Aborted', badgeType: 'badge-bad' }
            ]

            const blockedOffSite: IAuditGridItem[] = [
                { name: 'Search Indexing', status: 'Blocked (Insecure)', badgeType: 'badge-bad' },
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
                timeout: 6000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GEOAudit/1.0' },
                validateStatus: status => status < 500
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
                timeout: 5000,
                validateStatus: status => status === 200
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
                timeout: 8000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GEOAudit/1.0' }
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

            // Extract JSON-LD scripts
            const jsonLdScripts = $('script[type="application/ld+json"]').map((_, el) => $(el).html()).get()
            const foundSchemas: string[] = []

            jsonLdScripts.forEach(scriptStr => {
                try {
                    const parsed = JSON.parse(scriptStr || '{}')
                    const pushType = (t: unknown) => {
                        if (typeof t === 'string') foundSchemas.push(t.toLowerCase())
                    }

                    if (Array.isArray(parsed)) {
                        parsed.forEach(item => {
                            if (item['@type']) pushType(item['@type'])
                        })
                    } else if (parsed['@type']) {
                        pushType(parsed['@type'])
                    }
                    if (parsed['@graph'] && Array.isArray(parsed['@graph'])) {
                        parsed['@graph'].forEach((item: Record<string, unknown>) => {
                            if (item['@type']) pushType(item['@type'])
                        })
                    }
                } catch {
                    // invalid JSON-LD script
                }
            })

            // Also extract HTML Microdata itemtypes
            $('[itemtype]').each((_, el) => {
                const itemType = $(el).attr('itemtype')
                if (itemType) {
                    foundSchemas.push(itemType.toLowerCase())
                }
            })

            // Check key schemas for GEO & Search Indexing
            const hasOrgSchema = foundSchemas.some(s => s.includes('organization') || s.includes('brand') || s.includes('corporation') || s.includes('localbusiness'))
            const hasWebSiteSchema = foundSchemas.some(s => s.includes('website') || s.includes('sitenavigationelement') || s.includes('breadcrumblist'))
            const hasProductOrServiceSchema = foundSchemas.some(s => s.includes('product') || s.includes('softwareapplication') || s.includes('service') || s.includes('article'))
            const hasFaqSchema = foundSchemas.some(s => s.includes('faqpage') || s.includes('question'))
            const hasReviewSchema = foundSchemas.some(s => s.includes('review') || s.includes('aggregaterating'))

            const bType = brand.businessType || 'ecommerce'
            let entitySchemaLabel = 'Product / Service schema'
            if (bType === 'saas') entitySchemaLabel = 'SoftwareApplication schema'
            else if (bType === 'service') entitySchemaLabel = 'Service / ProfessionalService schema'
            else if (bType === 'local_business') entitySchemaLabel = 'LocalBusiness schema'
            else if (bType === 'content_media') entitySchemaLabel = 'Article / NewsArticle schema'
            else entitySchemaLabel = 'Product / Brand schema'

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
                name: entitySchemaLabel,
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
                htmlIssues.push('FAQPage schema missing on homepage (Limits direct AI answers and search snippet citations)')
            }
            if (!hasProductOrServiceSchema && !hasWebSiteSchema) {
                htmlIssues.push(`No ${entitySchemaLabel} or WebSite Schema.org markup detected`)
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

                if (lowerHref.includes('/docs') || lowerHref.includes('docs.') || lowerHref.includes('/documentation') || lowerHref.includes('/help') || lowerHref.includes('/developer')) {
                    hasDocsLink = true
                }
                if (lowerHref.includes('/api') || lowerHref.includes('api.')) {
                    hasApiLink = true
                }

                // Detect external sales, B2B & review platforms
                if (lowerHref.includes('indiamart.com')) detectedPlatforms.push({ name: 'IndiaMART B2B Listing', url: href })
                if (lowerHref.includes('tradeindia.com')) detectedPlatforms.push({ name: 'TradeIndia B2B Listing', url: href })
                if (lowerHref.includes('exportersindia.com')) detectedPlatforms.push({ name: 'ExportersIndia Profile', url: href })
                if (lowerHref.includes('amazon.')) detectedPlatforms.push({ name: 'Amazon Store', url: href })
                if (lowerHref.includes('flipkart.')) detectedPlatforms.push({ name: 'Flipkart Store', url: href })
                if (lowerHref.includes('meesho.')) detectedPlatforms.push({ name: 'Meesho Store', url: href })
                if (lowerHref.includes('jiomart.com')) detectedPlatforms.push({ name: 'JioMart Store', url: href })
                if (lowerHref.includes('nykaa.')) detectedPlatforms.push({ name: 'Nykaa Store', url: href })
                if (lowerHref.includes('myntra.')) detectedPlatforms.push({ name: 'Myntra Store', url: href })
                if (lowerHref.includes('shopify.')) detectedPlatforms.push({ name: 'Shopify Store', url: href })
                if (lowerHref.includes('etsy.')) detectedPlatforms.push({ name: 'Etsy Store', url: href })
                if (lowerHref.includes('blinkit.com')) detectedPlatforms.push({ name: 'Blinkit Listing', url: href })
                if (lowerHref.includes('zepto')) detectedPlatforms.push({ name: 'Zepto Listing', url: href })
                if (lowerHref.includes('g2.com')) detectedPlatforms.push({ name: 'G2 Directory Profile', url: href })
                if (lowerHref.includes('capterra.com')) detectedPlatforms.push({ name: 'Capterra Profile', url: href })
                if (lowerHref.includes('trustpilot.com')) detectedPlatforms.push({ name: 'Trustpilot Profile', url: href })
                if (lowerHref.includes('producthunt.com')) detectedPlatforms.push({ name: 'ProductHunt Profile', url: href })
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
                { name: 'Product / App schema', status: 'Unchecked', badgeType: 'badge-warn' },
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
        const dbMentionsCount = await mentionModel.countDocuments({ brandId })

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
        const uniquePlatforms = Array.from(new Map(detectedPlatforms.map(p => [p.name, p])).values())

        if (uniquePlatforms.length > 0) {
            uniquePlatforms.forEach(p => {
                marketplaceReadability.push({
                    name: `${p.name} Listing Readability`,
                    status: 'Linked & AI Readable',
                    badgeType: 'badge-ok'
                })
            })
            marketplaceReadability.push({
                name: 'Structured Product Schema',
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
                name: 'Marketplace & Sales Channels',
                status: 'No External Platforms Linked',
                badgeType: 'badge-warn'
            })
        }

        // Compile "What's holding you back" (List of failed or warning checks)
        const holdingBack: string[] = [...htmlIssues]

        // Add blocked crawlers to holdingBack
        const blockedCrawlers = crawlerAccess.filter(c => c.status === 'Blocked').map(c => `${c.name} crawler currently blocked in robots.txt`)
        holdingBack.push(...blockedCrawlers)

        if (!llmsTxtFound) {
            holdingBack.push('No llms.txt standard file found for AI model scrapers')
        }

        // Calculate dynamic Health Score (0 - 100)
        const allItems = [...crawlerAccess, ...structuredData, ...offSiteFootprint, ...marketplaceReadability]
        const passedCount = allItems.filter(i => i.badgeType === 'badge-ok').length
        const totalItems = allItems.length
        let healthScore = totalItems > 0 ? Math.round((passedCount / totalItems) * 100) : 50

        // If website fetch failed, deduct penalty
        if (!fetchSuccess) {
            healthScore = Math.max(10, healthScore - 25)
        }

        // Update or recreate audit in database
        const existingAudit = await auditModel.findOne({ brandId })
        if (existingAudit) {
            existingAudit.healthScore = healthScore
            existingAudit.holdingBack = holdingBack
            existingAudit.crawlerAccess = crawlerAccess
            existingAudit.structuredData = structuredData
            existingAudit.offSiteFootprint = offSiteFootprint
            existingAudit.marketplaceReadability = marketplaceReadability
            existingAudit.lastAuditedAt = new Date()
            await existingAudit.save()
            return existingAudit
        }

        return auditModel.create({
            brandId,
            healthScore,
            holdingBack,
            crawlerAccess,
            structuredData,
            offSiteFootprint,
            marketplaceReadability,
            lastAuditedAt: new Date()
        })
    }
}
