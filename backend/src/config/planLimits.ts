export const PLAN_LIMITS = {
    free: {
        maxQueries: 3,
        maxBrands: 1,
        maxCompetitors: 3,
        allowedModels: ['Claude', 'GPT'],
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
        allowedModels: ['Claude', 'GPT', 'Gemini', 'Google AI Overview'],
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
        allowedModels: ['Claude', 'GPT', 'Gemini', 'Google AI Overview', 'Meta AI', 'Perplexity'],
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
        allowedModels: ['Claude', 'GPT', 'Gemini', 'Google AI Overview', 'Meta AI', 'Perplexity'],
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
