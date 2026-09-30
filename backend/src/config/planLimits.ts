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
        maxBrands: 2,
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
        maxQueries: 50,
        maxBrands: 3,
        maxCompetitors: 10,
        allowedModels: STANDARD_AI_MODELS,
        allowedProviders: STANDARD_AI_PROVIDERS,
        allowedLanguages: ['en', 'hi-en', 'hi', 'ta', 'bn'],
        features: {
            multiBrand: false,
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
    starter: 168,
    growth: 72,
    agency: 12
}

// Manual "Re-scan now" runs allowed per brand per day (IST); scheduled scans don't count
export const MANUAL_RESCANS_PER_DAY: Record<PlanName, number> = {
    free: 0,
    starter: 1,
    growth: 3,
    agency: 10
}

export const getNextScanAt = (plan: string | undefined, from: Date = new Date()) => {
    const hours = SCAN_INTERVAL_HOURS[(plan || 'starter') as PlanName] ?? SCAN_INTERVAL_HOURS.starter
    return new Date(from.getTime() + hours * 60 * 60 * 1000)
}
