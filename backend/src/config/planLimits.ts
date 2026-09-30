// aiModel.provider values scanned for each tier (one active model per provider)
const FREE_AI_PROVIDERS = ['OpenAI', 'Google', 'Anthropic']
const ALL_AI_PROVIDERS = ['OpenAI', 'Google', 'Anthropic', 'xAI', 'DeepSeek', 'Perplexity']
const FREE_AI_MODELS = ['ChatGPT', 'Gemini', 'Claude']
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
        allowedModels: ALL_AI_MODELS,
        allowedProviders: ALL_AI_PROVIDERS,
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
        allowedModels: ALL_AI_MODELS,
        allowedProviders: ALL_AI_PROVIDERS,
        allowedLanguages: ['en', 'hi-en', 'hi', 'ta', 'bn'],
        features: {
            multiBrand: false,
            recommendations: true,
            whatsapp: true,
            competitorAnalysis: true
        }
    },
    agency: {
        maxQueries: Infinity,
        maxBrands: Infinity,
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
    growth: 24,
    agency: 12
}

export const getNextScanAt = (plan: string | undefined, from: Date = new Date()) => {
    const hours = SCAN_INTERVAL_HOURS[(plan || 'starter') as PlanName] ?? SCAN_INTERVAL_HOURS.starter
    return new Date(from.getTime() + hours * 60 * 60 * 1000)
}
