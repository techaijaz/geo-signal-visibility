// aiModel.provider values scanned for each tier (one active model per provider)
// Perplexity is agency-only: its per-request fee makes it the costliest AI per call
const FREE_AI_PROVIDERS = ['OpenAI', 'Google', 'Anthropic']
const STANDARD_AI_PROVIDERS = ['OpenAI', 'Google', 'Anthropic', 'xAI', 'DeepSeek']
const ALL_AI_PROVIDERS = ['OpenAI', 'Google', 'Anthropic', 'xAI', 'DeepSeek', 'Perplexity']
const FREE_AI_MODELS = ['ChatGPT', 'Gemini', 'Claude']
const STANDARD_AI_MODELS = ['ChatGPT', 'Gemini', 'Claude', 'Grok', 'DeepSeek']
const ALL_AI_MODELS = ['ChatGPT', 'Gemini', 'Claude', 'Grok', 'DeepSeek', 'Perplexity']

export const PLAN_LIMITS = {
    free: {
        maxQueries: 3,
        maxBrands: 1,
        maxCompetitors: 3,
        allowedModels: FREE_AI_MODELS,
        allowedProviders: FREE_AI_PROVIDERS,
        allowedLanguages: ['en'],
        features: {
            multiBrand: false,
            recommendations: false,
            whatsapp: false,
            competitorAnalysis: false
        }
    },
    starter: {
        maxQueries: 15,
        maxBrands: 1,
        maxCompetitors: 5,
        allowedModels: STANDARD_AI_MODELS,
        allowedProviders: STANDARD_AI_PROVIDERS,
        allowedLanguages: ['en', 'hi-en'],
        features: {
            multiBrand: false,
            recommendations: true,
            whatsapp: false,
            competitorAnalysis: false
        }
    },
    growth: {
        maxQueries: 30,
        maxBrands: 3,
        maxCompetitors: 10,
        allowedModels: STANDARD_AI_MODELS,
        allowedProviders: STANDARD_AI_PROVIDERS,
        allowedLanguages: ['en', 'hi-en', 'hi', 'ta', 'bn'],
        features: {
            multiBrand: true,
            recommendations: true,
            whatsapp: true,
            competitorAnalysis: true
        }
    },
    agency: {
        // Fair-use caps: every query runs on 6 AIs twice a day, so these bound the AI spend
        maxQueries: 100,
        maxBrands: 25,
        maxCompetitors: Infinity,
        allowedModels: ALL_AI_MODELS,
        allowedProviders: ALL_AI_PROVIDERS,
        allowedLanguages: ['en', 'hi-en', 'hi', 'ta', 'bn', 'te', 'mr'],
        features: {
            multiBrand: true,
            recommendations: true,
            whatsapp: true,
            competitorAnalysis: true,
            whiteLabel: true,
            multiTeam: true
        }
    }
} as const

export type PlanName = keyof typeof PLAN_LIMITS

export const getPlanLimits = (plan: PlanName) => PLAN_LIMITS[plan]

// How often each plan's brands are auto-scanned
export const SCAN_INTERVAL_HOURS: Record<PlanName, number> = {
    free: 168,
    starter: 24,
    growth: 8,
    agency: 12
}

export type RescanKind = 'scan' | 'audit' | 'recommendation'

// Manual re-runs allowed per brand per day (IST); scheduled scans don't count.
// Sized so a customer using every limit still leaves >= 50% margin. With the 6h AI response
// cache a brand gets at most ~4 fresh scans/day however auto + manual scans are combined
export const DAILY_RESCAN_LIMITS: Record<PlanName, Record<RescanKind, number>> = {
    free: { scan: 0, audit: 1, recommendation: 0 },
    starter: { scan: 1, audit: 2, recommendation: 1 },
    growth: { scan: 3, audit: 3, recommendation: 2 },
    agency: { scan: 10, audit: 10, recommendation: 10 }
}

const RESCAN_LABELS: Record<RescanKind, string> = {
    scan: 'AI re-scan',
    audit: 'site audit re-run',
    recommendation: 'recommendation refresh'
}

export const rescanLimitMessage = (kind: RescanKind, plan: PlanName, perDay: number) =>
    perDay === 0
        ? `Manual ${RESCAN_LABELS[kind]} is not available on the ${plan} plan. Upgrade to run it on demand.`
        : `Daily ${RESCAN_LABELS[kind]} limit reached (${perDay}/${perDay} for this brand on the ${plan} plan). It resets at midnight IST, or upgrade for more.`

export const getNextScanAt = (plan: string | undefined, from: Date = new Date()) => {
    const hours = SCAN_INTERVAL_HOURS[(plan || 'free') as PlanName] ?? SCAN_INTERVAL_HOURS.free
    return new Date(from.getTime() + hours * 60 * 60 * 1000)
}
