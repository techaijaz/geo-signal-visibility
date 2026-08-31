// backend/src/service/recommendationService.ts
import { IBrand } from '../types/brandTypes'
import { IAuditData } from '../types/auditTypes'
import { IMention } from '../types/mentionTypes'
import { IRecommendationData } from '../types/recommendationTypes'
import aiService from './aiService'

const buildAuditSummary = (audit: IAuditData): string => {
  if (!audit) return 'Audit data unavailable'
  const marketplaceList = audit.marketplaceReadability?.map(m => `${m.name}: ${m.status}`).join(', ') || 'None detected'
  return `Health Score: ${audit.healthScore}. Structured Data: ${audit.structuredData?.length || 0} schemas found. Detected Sales/Marketplace Channels: ${marketplaceList}`
}

const buildMentionStats = (mentions: IMention[], brand: IBrand): string => {
  if (!mentions || mentions.length === 0) return 'No mentions recorded.'
  const mentioned = mentions.filter(m => m.mentioned).length
  return `Mentioned in ${mentioned}/${mentions.length} queries for ${brand.name}.`
}

const safelyParseJSON = (str: string): any => {
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
  const competitorContext = (competitorMentions || []).slice(0, 3)
    .map(m => `Query: "${m.queryText}" — ${m.rawText?.slice(0, 500)}`)
    .join('\n\n')

  const prompt = `
    You are an expert GEO (Generative Engine Optimization) consultant.
    
    Brand: ${brand.name}
    Category: ${brand.category}
    Business Type / Niche: ${brand.businessType || 'ecommerce'}
    Website: ${brand.website}
    Competitors: ${brand.competitors?.map((c: any) => c.name).join(', ') || 'N/A'}
    
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
      return parsed.slice(0, 8).map(rec => ({
        brandId: brand._id.toString(),
        text: rec.text,
        category: (['Technical', 'Content', 'Off-site'].includes(rec.category) ? rec.category : 'Content') as any,
        effort: (['Low effort', 'Medium effort', 'High effort'].includes(rec.effort) ? rec.effort : 'Medium effort') as any,
        impact: (['High impact', 'Medium impact', 'Low impact'].includes(rec.impact) ? rec.impact : 'High impact') as any,
        reasoning: rec.reasoning || 'Actionable recommendation for improving AI crawler indexability and mention frequency.',
        snippet: rec.fixSnippet || rec.snippet || '',
        isCompleted: false,
        source: 'ai-generated'
      }))
    }
  } catch (err) {
    console.error('Error generating AI recommendations:', err)
  }

  return []
}