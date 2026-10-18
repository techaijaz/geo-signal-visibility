import type { IAuditData } from '../types/auditTypes'
import type { IRecommendationData } from '../types/recommendationTypes'
import type { ISiteProfile } from './siteProfile'
import { isResolvedByAudit } from './recommendationService'

// The built-in list, used when the AI gives none. Shops get the original list; other sites get the same tasks
// without product talk, and service and local businesses get two local tasks
export const defaultRecommendations = (input: {
    brandId: string
    brandName: string
    comp1: string
    category: string
    profile: ISiteProfile
    audit: IAuditData | null
}): IRecommendationData[] => {
    const { brandId, brandName, comp1, category, profile, audit } = input
    const shop = profile.sellsProducts
    const local = profile.type === 'service' || profile.type === 'local'
    const inCity = profile.city ? ` in ${profile.city}` : ''
    const faqPages = shop ? 'top 10 product pages' : local ? 'main service pages' : 'main pages'

    const localTasks: IRecommendationData[] =
        local && !shop
            ? [
                  {
                      brandId,
                      text: `Add LocalBusiness schema with your address, phone and hours for ${brandName}`,
                      kind: 'service-schema',
                      category: 'Technical',
                      effort: 'Low effort',
                      impact: 'High impact',
                      reasoning: 'AI engines read LocalBusiness schema to learn where you are, when you are open and what you offer.',
                      snippet: `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "LocalBusiness",\n  "name": "${brandName}",\n  "address": { "@type": "PostalAddress", "addressLocality": "${profile.city}", "addressCountry": "IN" },\n  "telephone": "",\n  "openingHours": "Mo-Sa 10:00-20:00"\n}\n</script>`,
                      isCompleted: false
                  },
                  {
                      brandId,
                      text: `Get ${brandName} listed on Google Business Profile, Justdial and directories like Practo in ${profile.place}`,
                      kind: 'local-listing',
                      category: 'Off-site',
                      effort: 'Medium effort',
                      impact: 'High impact',
                      reasoning: 'AI answers to local questions often come from Google Business Profile and directories like Justdial and Practo.',
                      isCompleted: false
                  }
              ]
            : []

    const list: IRecommendationData[] = [
        {
            brandId,
            text: `Unblock Google-Extended in robots.txt so Gemini can crawl ${brandName}`,
            kind: 'crawler-access',
            category: 'Technical',
            effort: 'Low effort',
            impact: 'High impact',
            reasoning: 'AI search crawlers (Google-Extended, GPTBot, ClaudeBot) need explicit robots.txt permissions to index your domain.',
            snippet: `User-agent: Google-Extended\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /`,
            isCompleted: false
        },
        {
            brandId,
            text: `Publish an llms.txt with a clear, structured summary of what ${brandName} ${shop ? 'sells' : 'offers'}`,
            kind: 'llms-txt',
            category: 'Technical',
            effort: 'Low effort',
            impact: 'Medium impact',
            reasoning: 'llms.txt acts as a standardized machine-readable summary that AI LLMs ingest during live retrieval.',
            snippet: shop
                ? `# ${brandName}\n> ${category} brand specializing in high-quality products.\n\n## Key facts\n- Quality tested & certified\n- Direct to consumer shipping\n- Founded with sustainable practices`
                : `# ${brandName}\n> ${category}: what we offer and who it is for.\n\n## Services\n- Main service 1\n- Main service 2\n\n## Contact\n- Address, city and phone`,
            isCompleted: false
        },
        {
            brandId,
            text: `Add FAQPage schema to your ${faqPages} for ${brandName}`,
            kind: 'faq-schema',
            category: 'Content',
            effort: 'Medium effort',
            impact: 'High impact',
            reasoning: 'Structured JSON-LD FAQ schemas provide direct question-and-answer pairs that LLMs extract for user queries.',
            snippet: shop
                ? `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "FAQPage",\n  "mainEntity": [{\n    "@type": "Question",\n    "name": "Is ${brandName} suitable for daily use?",\n    "acceptedAnswer": {\n      "@type": "Answer",\n      "text": "Yes, ${brandName} products are formulated for safe daily routines."\n    }\n  }]\n}\n</script>`
                : `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "FAQPage",\n  "mainEntity": [{\n    "@type": "Question",\n    "name": "How much does ${brandName} charge?",\n    "acceptedAnswer": {\n      "@type": "Answer",\n      "text": "It depends on the service. Each service page shows the price range, or call us for a quote."\n    }\n  }]\n}\n</script>`,
            isCompleted: false
        },
        {
            brandId,
            text: `Publish a direct "${brandName} vs. ${comp1}" comparison page`,
            kind: 'comparison-page',
            category: 'Content',
            effort: 'Medium effort',
            impact: 'High impact',
            reasoning: 'AI users frequently ask comparative queries ("X vs Y"). High-ranking comparison pages train LLM sentiment.',
            snippet: shop
                ? `# ${brandName} vs ${comp1}: Complete Comparison Guide\n\n- Key Ingredients & Benefits\n- Pricing & Value Comparison\n- Customer Ratings & Verified Reviews`
                : `# ${brandName} vs ${comp1}: Complete Comparison Guide\n\n- Services & Experience\n- Pricing & Value Comparison\n- Client Ratings & Verified Reviews`,
            isCompleted: false
        },
        {
            brandId,
            text: shop
                ? `Collect 20+ verified customer reviews for ${brandName} on your primary sales channel or Google/Trustpilot`
                : `Collect 20+ verified reviews for ${brandName} on Google Business Profile${inCity}`,
            kind: 'reviews',
            category: 'Off-site',
            effort: 'High effort',
            impact: 'High impact',
            reasoning: shop
                ? 'Off-site review volume on verified customer channels serves as a strong trust signal for generative AI answer engines.'
                : 'Reviews on Google Business Profile and trusted directories are a strong trust signal for AI answer engines.',
            isCompleted: false
        },
        ...localTasks,
        {
            brandId,
            text: `Build a genuine presence in relevant ${category} subreddits & online forums`,
            kind: 'forums',
            category: 'Off-site',
            effort: 'High effort',
            impact: 'Medium impact',
            reasoning: 'Community forums like Reddit and Quora are primary sources for AI search indexing and user citations.',
            isCompleted: false
        }
    ]
    return list.filter((r) => !isResolvedByAudit(r.text, audit))
}
