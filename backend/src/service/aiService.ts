import config from '../config/config'
import brandModel from '../model/brandModel'
import mentionModel from '../model/mentionModel'
import { IMention } from '../types/mentionTypes'
import logger from '../util/loger'
import databseService from './databseService'

interface IOpenAiChatResponse {
    choices?: Array<{
        message?: {
            content?: string
        }
    }>
}

interface IGeminiResponse {
    candidates?: Array<{
        content?: {
            parts?: Array<{
                text?: string
            }>
        }
    }>
}

interface IClaudeResponse {
    content?: Array<{
        text?: string
    }>
}

export interface IAiScanResult {
    brandId: string
    queryText: string
    model: string
    mentioned: boolean
    position: number | null
    sentiment: 'Positive' | 'Neutral' | 'Negative'
    rawResponse?: string
    extractedAt: Date
}

const aiService = {
    /**
     * Call DeepSeek API (OpenAI compatible endpoint)
     */
    callDeepSeek: async (prompt: string, modelOverride?: string, maxTokensOverride?: number): Promise<string | null> => {
        const apiKey = await databseService.getDecryptedApiKey('DEEPSEEK')
        if (!apiKey) return null
        const targetModel = modelOverride || config.AI_MODELS.DEEPSEEK || 'deepseek-v4-flash'
        try {
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: targetModel,
                    messages: [
                        { role: 'system', content: 'You are an AI search engine assistant providing authoritative recommendations for brands, products, software, and services.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7,
                    max_tokens: maxTokensOverride || 400
                })
            })
            if (!response.ok) {
                // If custom model variant fails, fallback to deepseek-chat endpoint model
                if (targetModel !== 'deepseek-chat') {
                    return aiService.callDeepSeek(prompt, 'deepseek-chat', maxTokensOverride)
                }
                return null
            }
            const data = (await response.json()) as IOpenAiChatResponse
            return data.choices?.[0]?.message?.content || null
        } catch (error) {
            logger.error('DeepSeek API Error:', { meta: error })
            return null
        }
    },

    /**
     * Call OpenAI GPT API
     */
    callOpenAI: async (prompt: string, maxTokensOverride?: number): Promise<string | null> => {
        const apiKey = await databseService.getDecryptedApiKey('OPENAI')
        if (!apiKey) return null
        const modelName = config.AI_MODELS.OPENAI || 'gpt-4o-mini'
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [
                        { role: 'system', content: 'You are an AI search engine assistant providing authoritative recommendations for brands, products, software, and services.' },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: maxTokensOverride || 400
                })
            })
            if (!response.ok) return null
            const data = (await response.json()) as IOpenAiChatResponse
            return data.choices?.[0]?.message?.content || null
        } catch (error) {
            logger.error('OpenAI API Error:', { meta: error })
            return null
        }
    },

    /**
     * Call Google Gemini API
     */
    callGemini: async (prompt: string, modelOverride?: string): Promise<string | null> => {
        const apiKey = await databseService.getDecryptedApiKey('GEMINI')
        if (!apiKey) return null
        let modelName = (modelOverride || config.AI_MODELS.GEMINI || 'gemini-1.5-flash').trim()

        // Normalize common user-entered model names to valid Google Gemini REST API model slugs
        const lower = modelName.toLowerCase()
        if (lower.includes('lite')) {
            modelName = 'gemini-2.0-flash-lite'
        } else if (lower.includes('2.0')) {
            modelName = 'gemini-2.0-flash'
        } else if (lower.includes('pro')) {
            modelName = 'gemini-1.5-pro'
        } else if (!modelName.startsWith('gemini-')) {
            modelName = 'gemini-1.5-flash'
        }

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            })
            if (!response.ok) {
                // If model slug fails, fallback to standard gemini-1.5-flash
                if (modelName !== 'gemini-1.5-flash') {
                    const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
                    const fallbackRes = await fetch(fallbackUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }]
                        })
                    })
                    if (fallbackRes.ok) {
                        const fallbackData = (await fallbackRes.json()) as IGeminiResponse
                        return fallbackData.candidates?.[0]?.content?.parts?.[0]?.text || null
                    }
                }
                return null
            }
            const data = (await response.json()) as IGeminiResponse
            return data.candidates?.[0]?.content?.parts?.[0]?.text || null
        } catch (error) {
            logger.error('Gemini API Error:', { meta: error })
            return null
        }
    },

    /**
     * Call Anthropic Claude API
     */
    callClaude: async (prompt: string, maxTokensOverride?: number): Promise<string | null> => {
        const apiKey = await databseService.getDecryptedApiKey('ANTHROPIC')
        if (!apiKey) return null
        const modelName = config.AI_MODELS.CLAUDE || 'claude-3-5-sonnet-20241022'
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: modelName,
                    max_tokens: maxTokensOverride || 400,
                    messages: [{ role: 'user', content: prompt }]
                })
            })
            if (!response.ok) return null
            const data = (await response.json()) as IClaudeResponse
            return data.content?.[0]?.text || null
        } catch (error) {
            logger.error('Claude API Error:', { meta: error })
            return null
        }
    },

    /**
     * Call any available configured AI provider in sequence
     */
    callAnyAvailableAi: async (prompt: string, maxTokens = 1500): Promise<string | null> => {
        const geminiRes = await aiService.callGemini(prompt)
        if (geminiRes) return geminiRes

        const openaiRes = await aiService.callOpenAI(prompt, maxTokens)
        if (openaiRes) return openaiRes

        const claudeRes = await aiService.callClaude(prompt, maxTokens)
        if (claudeRes) return claudeRes

        const deepseekRes = await aiService.callDeepSeek(prompt, undefined, maxTokens)
        if (deepseekRes) return deepseekRes

        return null
    },

    /**
     * Call OmniRoute API (Unified LLM Router API Endpoint)
     */
    callOmniRoute: async (prompt: string, modelOverride?: string): Promise<string | null> => {
        const apiKey = await databseService.getDecryptedApiKey('OMNIROUTE')
        if (!apiKey) return null
        const targetModel = modelOverride || config.AI_MODELS.OMNIROUTE || 'omniroute-auto'
        try {
            const response = await fetch(config.OMNIROUTE_BASE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: targetModel,
                    messages: [
                        { role: 'system', content: 'You are an AI search engine assistant providing authoritative recommendations for brands, products, software, and services.' },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: 400
                })
            })
            if (!response.ok) return null
            const data = (await response.json()) as IOpenAiChatResponse
            return data.choices?.[0]?.message?.content || null
        } catch (error) {
            logger.error('OmniRoute API Error:', { meta: error })
            return null
        }
    },

    /**
     * Parse raw AI answer to extract mention presence, rank position, and sentiment
     */
    parseMentionFromText: (
        rawText: string,
        brandName: string
    ): { mentioned: boolean; position: number | null; sentiment: 'Positive' | 'Neutral' | 'Negative' } => {
        const lowerText = rawText.toLowerCase()
        const lowerBrand = brandName.toLowerCase()

        const mentioned = lowerText.includes(lowerBrand)
        if (!mentioned) {
            return { mentioned: false, position: null, sentiment: 'Neutral' }
        }

        // Position detection: look for numbered list position or paragraph position
        let position = 1
        const lines = rawText.split('\n')
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].toLowerCase()
            if (line.includes(lowerBrand)) {
                const numberMatch = lines[i].match(/^\s*(\d+)[.)]/)
                if (numberMatch) {
                    position = parseInt(numberMatch[1], 10)
                } else {
                    position = Math.min(i + 1, 5)
                }
                break
            }
        }

        // Sentiment classification
        let sentiment: 'Positive' | 'Neutral' | 'Negative' = 'Neutral'
        const positiveKeywords = ['best', 'top', 'great', 'excellent', 'highly recommended', 'popular', 'effective', 'fav', 'love']
        const negativeKeywords = ['bad', 'avoid', 'poor', 'expensive', 'overrated', 'issue', 'problem', 'disappointing']

        const positiveCount = positiveKeywords.filter(k => lowerText.includes(k)).length
        const negativeCount = negativeKeywords.filter(k => lowerText.includes(k)).length

        if (positiveCount > negativeCount && positiveCount > 0) {
            sentiment = 'Positive'
        } else if (negativeCount > positiveCount) {
            sentiment = 'Negative'
        }

        return { mentioned, position, sentiment }
    },

    /**
     * Execute scan across queries for a brand, querying live AI APIs or falling back to smart simulation
     */
    scanMentionsWithAi: async (brandId: string): Promise<IMention[]> => {
        const brand = await brandModel.findById(brandId)
        if (!brand) return []

        const brandName = brand.name
        const category = brand.category || 'general'
        const bType = brand.businessType || 'ecommerce'

        let defaultQueries: string[] = []
        if (bType === 'saas') {
            defaultQueries = [
                `Best ${category} software for startups and teams`,
                `${brandName} vs top competitors`,
                `Top recommended ${category} tools 2026`,
                `Best ${category} platforms and features`
            ]
        } else if (bType === 'service') {
            defaultQueries = [
                `Best ${category} services in India`,
                `Top rated ${category} agencies and companies`,
                `${brandName} client reviews and ratings`,
                `Top ${category} service providers`
            ]
        } else if (bType === 'local_business') {
            defaultQueries = [
                `Top ${category} in India`,
                `Best rated ${category} near me`,
                `${brandName} customer reviews and pricing`,
                `Best ${category} options`
            ]
        } else if (bType === 'content_media') {
            defaultQueries = [
                `Best ${category} websites and resources`,
                `Top ${category} blogs and news platforms`,
                `Is ${brandName} reliable and authentic`,
                `Top recommended ${category} sites`
            ]
        } else {
            defaultQueries = [
                `Best ${category} brand in India`,
                `${brandName} vs competitors`,
                `Top recommended ${category} brands 2026`,
                `Best value ${category} products`
            ]
        }

        const queries = brand.queries && brand.queries.length > 0
            ? brand.queries.map(q => q.text)
            : defaultQueries

        const trackedModels = ['DeepSeek (v4 Flash)', 'DeepSeek (v4 Pro)', 'Claude', 'GPT', 'Gemini', 'Google AI Overview', 'Meta AI']
        const results: IAiScanResult[] = []

        for (let idx = 0; idx < queries.length; idx++) {
            const queryText = queries[idx]
            for (let mIdx = 0; mIdx < trackedModels.length; mIdx++) {
                const modelName = trackedModels[mIdx]
                let rawText: string | null = null

                // Try calling live AI APIs if key is available
                if (modelName === 'DeepSeek (v4 Flash)') {
                    rawText = await aiService.callDeepSeek(queryText, 'deepseek-v4-flash')
                } else if (modelName === 'DeepSeek (v4 Pro)') {
                    rawText = await aiService.callDeepSeek(queryText, 'deepseek-v4-pro')
                } else if (modelName === 'DeepSeek') {
                    rawText = await aiService.callDeepSeek(queryText)
                } else if (modelName === 'GPT') {
                    rawText = await aiService.callOpenAI(queryText)
                } else if (modelName === 'Gemini' || modelName === 'Google AI Overview') {
                    rawText = await aiService.callGemini(queryText)
                } else if (modelName === 'Claude') {
                    rawText = await aiService.callClaude(queryText)
                } else if (modelName === 'OmniRoute') {
                    rawText = await aiService.callOmniRoute(queryText)
                }

                if (rawText) {
                    // Real AI Response received!
                    const parsed = aiService.parseMentionFromText(rawText, brandName)
                    results.push({
                        brandId,
                        queryText,
                        model: modelName,
                        mentioned: parsed.mentioned,
                        position: parsed.position,
                        sentiment: parsed.sentiment,
                        rawResponse: rawText,
                        extractedAt: new Date()
                    })
                } else {
                    // No live API response available or key not configured
                    results.push({
                        brandId,
                        queryText,
                        model: modelName,
                        mentioned: false,
                        position: null,
                        sentiment: 'Neutral',
                        rawResponse: 'Live API key not configured or response unavailable',
                        extractedAt: new Date()
                    })
                }
            }
        }

        await mentionModel.deleteMany({ brandId })
        return mentionModel.insertMany(results)
    }
}

export default aiService
