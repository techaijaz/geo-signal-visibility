// backend/src/service/recommendationService.ts
import { IBrand } from '../types/brandTypes'
import { IAuditData, IAuditGridItem } from '../types/auditTypes'
import { IMention } from '../types/mentionTypes'
import { IRecommendationData } from '../types/recommendationTypes'
import aiService from './aiService'
import logger from '../util/loger'

const buildAuditSummary = (audit: IAuditData): string => {
    if (!audit) return 'Audit data unavailable'
    const list = (items?: IAuditGridItem[]) => items?.map((i) => `${i.name}: ${i.status}`).join(', ') || 'None detected'
    return [
        `Health Score: ${audit.healthScore}.`,
        `Crawler Access: ${list(audit.crawlerAccess)}.`,
        `Structured Data: ${list(audit.structuredData)}.`,
        `Detected Sales/Marketplace Channels: ${list(audit.marketplaceReadability)}.`
    ].join('\n    ')
}

const isOk = (items: IAuditGridItem[] | undefined, name: RegExp) => !!items?.some((i) => name.test(i.name) && i.badgeType === 'badge-ok')

// True when the audit already shows this recommendation is done (llms.txt found, no crawler blocked,
// schema found), so we never tell a brand to fix something the audit page says is fine
export const isResolvedByAudit = (text: string, audit: IAuditData | null | undefined): boolean => {
    if (!audit) return false
    const crawlers = (audit.crawlerAccess || []).filter((c) => !/llms\.txt|SSL/i.test(c.name))
    if (/llms\.txt/i.test(text)) return isOk(audit.crawlerAccess, /llms\.txt/i)
    if (/unblock|robots\.txt/i.test(text)) return crawlers.length > 0 && crawlers.every((c) => c.badgeType === 'badge-ok')
    if (/faq/i.test(text) && /schema/i.test(text)) return isOk(audit.structuredData, /FAQPage/i)
    if (/organization/i.test(text) && /schema/i.test(text)) return isOk(audit.structuredData, /Organization/i)
    return false
}

const buildMentionStats = (mentions: IMention[], brand: IBrand): string => {
    if (!mentions || mentions.length === 0) return 'No mentions recorded.'
    const mentioned = mentions.filter((m) => m.mentioned).length
    return `Mentioned in ${mentioned}/${mentions.length} queries for ${brand.name}.`
}

const safelyParseJSON = (str: string): unknown => {
    try {
        const jsonMatch = str.match(/\[[\s\S]*\]/) || str.match(/\{[\s\S]*\}/)
        return JSON.parse(jsonMatch ? jsonMatch[0] : str)
    } catch {
        return null
    }
}

export const generateRecommendations = async (
    brand: IBrand,
    audit: IAuditData,
    mentions: IMention[],
    competitorMentions: IMention[]
): Promise<IRecommendationData[]> => {
    const auditSummary = buildAuditSummary(audit)
    const mentionStats = buildMentionStats(mentions, brand)
    const competitorContext = (competitorMentions || [])
        .slice(0, 3)
        .map((m) => `Query: "${m.queryText}" — ${m.rawText?.slice(0, 500)}`)
        .join('\n\n')

    const prompt = `
    You are an expert GEO (Generative Engine Optimization) consultant.
    
    Brand: ${brand.name}
    Category: ${brand.category}
    Business Type / Niche: ${brand.businessType || 'ecommerce'}
    Website: ${brand.website}
    Competitors: ${brand.competitors?.map((c) => c.name).join(', ') || 'N/A'}
    
    AUDIT RESULTS:
    ${auditSummary}
    
    CURRENT AI MENTION DATA (${mentions.length} tracked responses):
    ${mentionStats}
    
    SAMPLE COMPETITOR RESPONSES WHERE BRAND WAS CHOSEN INSTEAD:
    ${competitorContext}
    
    CRITICAL CONSTRAINTS:
    1. Tailor recommendations strictly to ${brand.name}'s actual business type (${brand.businessType || 'ecommerce'}) and category (${brand.category}).
    2. For SaaS/Software: Focus on SoftwareApplication JSON-LD schema, API/Doc indexability, G2/Capterra/GitHub listings, and integration guides.
    3. For E-commerce: Focus on Product JSON-LD schema, price transparency, review aggregation, and shopping channel readability.
    4. For Services/Local Business: Focus on Service/LocalBusiness schema, Google Business Profile, local reviews, and location landing pages.
    5. For Content/Media: Focus on Article/NewsArticle schema, author entity verification, and citation authority.
    6. Suggest review sources or citations appropriate for their business type.
    7. Do not recommend anything the audit already shows as found or allowed.

    Based on this data, generate 6-8 specific, actionable recommendations ranked by impact.
    Return JSON array with:
    {
      "text": string,
      "category": "Content" | "Technical" | "Off-site",
      "effort": "Low effort" | "Medium effort" | "High effort",
      "impact": "Low impact" | "Medium impact" | "High impact",
      "reasoning": string,
      "fixSnippet": string
    }
  `

    try {
        const response = await aiService.callAnyAvailableAi(prompt, 1500)
        const parsed = safelyParseJSON(response || '')

        if (parsed && Array.isArray(parsed) && parsed.length > 0) {
            const fresh = parsed.filter((rec) => typeof rec?.text === 'string' && !isResolvedByAudit(rec.text, audit))
            return fresh.slice(0, 8).map((rec) => ({
                brandId: brand._id.toString(),
                text: rec.text,
                category: (['Technical', 'Content', 'Off-site'].includes(rec.category) ? rec.category : 'Content') as IRecommendationData['category'],
                effort: (['Low effort', 'Medium effort', 'High effort'].includes(rec.effort)
                    ? rec.effort
                    : 'Medium effort') as IRecommendationData['effort'],
                impact: (['High impact', 'Medium impact', 'Low impact'].includes(rec.impact)
                    ? rec.impact
                    : 'High impact') as IRecommendationData['impact'],
                reasoning: rec.reasoning || 'Actionable recommendation for improving AI crawler indexability and mention frequency.',
                snippet: rec.fixSnippet || rec.snippet || '',
                isCompleted: false,
                source: 'ai-generated'
            }))
        }
    } catch (err) {
        logger.error('Error generating AI recommendations', { meta: { err } })
    }

    return []
}
