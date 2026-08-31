// backend/src/service/auditService/index.ts
// Central orchestrator
import { IBrand } from '../../types/brandTypes'
import { IAuditData } from '../../types/auditTypes'
import { extractDomain, fetchRobotsTxt, parseRobotsForCrawler, fetchLlmsTxt, fetchHomePageMeta } from './crawlerService'
import { extractSchemaMarkup } from './schemaService'
import { analyzeContentStructure } from './contentService'

export const computeHealthScore = (crawlerChecks: any[], schemaTypes: any[], contentAnalysis: any): number => {
  let score = 50
  if (crawlerChecks.some(c => c.allowed)) score += 20
  if (schemaTypes.length > 0) score += 15
  if (contentAnalysis?.hasDirectAnswer) score += 15
  return Math.min(100, score)
}

export const runFullAudit = async (brand: IBrand): Promise<IAuditData> => {
  const domain = extractDomain(brand.website || '')

  // Run all checks in parallel
  const [robotsTxtRes, schemaTypesRes, contentAnalysisRes, llmsTxtRes] = await Promise.allSettled([
    fetchRobotsTxt(domain),
    extractSchemaMarkup(`https://${domain}`),
    analyzeContentStructure(`https://${domain}`, brand.name),
    fetchLlmsTxt(domain),
    fetchHomePageMeta(domain)
  ])

  const robotsTxt = robotsTxtRes.status === 'fulfilled' ? robotsTxtRes.value : null
  const schemaTypes = schemaTypesRes.status === 'fulfilled' ? schemaTypesRes.value : []
  const contentAnalysis = contentAnalysisRes.status === 'fulfilled' ? contentAnalysisRes.value : {
    hasDirectAnswer: false, h1Count: 0, h2Count: 0, hasFaqSection: false, wordCount: 0, hasFreshnessSignal: false
  }
  const llmsTxt = llmsTxtRes.status === 'fulfilled' ? llmsTxtRes.value : null

  const crawlerChecks = robotsTxt
    ? [
        parseRobotsForCrawler(robotsTxt, 'GPTBot'),
        parseRobotsForCrawler(robotsTxt, 'ClaudeBot'),
        parseRobotsForCrawler(robotsTxt, 'Google-Extended'),
        parseRobotsForCrawler(robotsTxt, 'PerplexityBot')
      ]
    : [
        { userAgent: 'GPTBot', allowed: true },
        { userAgent: 'ClaudeBot', allowed: true },
        { userAgent: 'Google-Extended', allowed: true },
        { userAgent: 'PerplexityBot', allowed: true }
      ]

  return {
    brandId: brand._id.toString(),
    healthScore: computeHealthScore(crawlerChecks, schemaTypes, contentAnalysis),
    checks: {
      crawlerAccess: crawlerChecks.map(c => ({
        name: c.userAgent,
        status: c.allowed ? 'Allowed' : 'Blocked',
        badgeType: c.allowed ? 'badge-ok' : 'badge-bad',
        rule: c.rule
      })),
      structuredData: schemaTypes.map((t: string) => ({ name: `${t} schema`, status: 'Found', badgeType: 'badge-ok' })),
      contentHealth: {
        hasDirectAnswer: contentAnalysis.hasDirectAnswer,
        h1Count: contentAnalysis.h1Count,
        h2Count: contentAnalysis.h2Count,
        hasFaqSection: contentAnalysis.hasFaqSection,
        wordCount: contentAnalysis.wordCount,
        hasFreshnessSignal: contentAnalysis.hasFreshnessSignal
      },
      llmsTxtPresent: !!llmsTxt,
      crawledAt: new Date()
    }
  }
}