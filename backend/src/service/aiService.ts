import config from '../config/config'
import { createHash } from 'crypto'
import { aiFetch } from '../util/aiHttp'
import aiResponseCacheModel from '../model/aiResponseCacheModel'
import { randomUUID } from 'crypto'
import brandModel from '../model/brandModel'
import orgModel from '../model/orgModel'
import { getNextScanAt, getPlanLimits, type PlanName } from '../config/planLimits'
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
            const response = await aiFetch('DEEPSEEK', 'https://api.deepseek.com/chat/completions', {
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
            const response = await aiFetch('OPENAI', 'https://api.openai.com/v1/chat/completions', {
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
            const response = await aiFetch('GEMINI', url, {
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
                    const fallbackRes = await aiFetch('GEMINI', fallbackUrl, {
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
            const response = await aiFetch('ANTHROPIC', 'https://api.anthropic.com/v1/messages', {
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
            const response = await aiFetch('OMNIROUTE', config.OMNIROUTE_BASE_URL, {
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
     * Call Perplexity API (OpenAI compatible, web-search grounded Sonar models)
     */
    callPerplexity: async (prompt: string, modelOverride?: string): Promise<string | null> => {
        const apiKey = await databseService.getDecryptedApiKey('PERPLEXITY')
        if (!apiKey) return null
        const targetModel = modelOverride || config.AI_MODELS.PERPLEXITY || 'sonar'
        try {
            const response = await aiFetch('PERPLEXITY', 'https://api.perplexity.ai/chat/completions', {
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
            logger.error('Perplexity API Error:', { meta: error })
            return null
        }
    },

    /**
     * Call xAI Grok API (OpenAI compatible endpoint)
     */
    callGrok: async (prompt: string, modelOverride?: string): Promise<string | null> => {
        const apiKey = await databseService.getDecryptedApiKey('XAI')
        if (!apiKey) return null
        const targetModel = modelOverride || config.AI_MODELS.GROK || 'grok-3-mini'
        try {
            const response = await aiFetch('XAI', 'https://api.x.ai/v1/chat/completions', {
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
            logger.error('Grok API Error:', { meta: error })
            return null
        }
    },

    /**
     * Call OpenRouter API
     */
    callOpenRouter: async (prompt: string, modelName: string): Promise<string | null> => {
        const apiKey = await databseService.getDecryptedApiKey('OPENROUTER')
        if (!apiKey) return null
        try {
            const response = await aiFetch('OPENROUTER', 'https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': config.FRONTEND_URL || 'http://localhost:5173',
                    'X-Title': 'GEO Dashboard'
                },
                body: JSON.stringify({
                    model: modelName,
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
            logger.error('OpenRouter API Error:', { meta: error })
            return null
        }
    },

    /**
     * Route a query to the configured provider for a tracked model
     */
    callModel: async (provider: string, modelId: string, queryText: string): Promise<string | null> => {
        if (config.DISABLED_AI_PROVIDERS.includes(provider)) return null
        if (provider === 'OpenRouter') return aiService.callOpenRouter(queryText, modelId)
        if (provider === 'Google') return aiService.callGemini(queryText, modelId)
        if (provider === 'Anthropic') return aiService.callClaude(queryText)
        if (provider === 'DeepSeek') return aiService.callDeepSeek(queryText, modelId)
        if (provider === 'Perplexity') return aiService.callPerplexity(queryText, modelId)
        if (provider === 'xAI') return aiService.callGrok(queryText, modelId)
        if (provider === 'OmniRoute') return aiService.callOmniRoute(queryText, modelId)
        // OpenAI, and fallback for unknown providers
        return aiService.callOpenAI(queryText)
    },

    /**
     * callModel with a shared response cache: the same question to the same model within the TTL
     * is answered once, whichever brand asks it
     */
    callModelCached: async (provider: string, modelId: string, queryText: string): Promise<string | null> => {
        const ttlHours = config.AI_LIMITS.CACHE_TTL_HOURS
        if (ttlHours <= 0) return aiService.callModel(provider, modelId, queryText)

        const normalized = queryText.trim().toLowerCase().replace(/\s+/g, ' ')
        const key = createHash('sha256').update(`${provider}|${modelId}|${normalized}`).digest('hex')

        const hit = await aiResponseCacheModel.findOne({ key, expiresAt: { $gt: new Date() } }).lean()
        if (hit) return hit.response

        const response = await aiService.callModel(provider, modelId, queryText)
        if (response) {
            await aiResponseCacheModel
                .updateOne(
                    { key },
                    { $set: { provider, modelId, queryText: normalized, response, expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000) } },
                    { upsert: true }
                )
                .catch((err) => logger.warn('[aiService] Failed to write AI response cache', { meta: err }))
        }
        return response
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

        const org = await orgModel.findById(brand.orgId).select('plan')
        const planLimits = getPlanLimits((org?.plan || 'starter') as PlanName)
        const allowedProviders: readonly string[] = planLimits?.allowedProviders ?? []

        const aiModel = (await import('../model/aiModel')).default
        const activeModels = await aiModel.find({ isActive: true }).sort({ isDefault: -1, name: 1 })
        // One model per provider, restricted to the plan's providers and never a disabled gateway
        const seenProviders = new Set<string>()
        const modelsToRun = activeModels.filter((m) => {
            if (!allowedProviders.includes(m.provider) || config.DISABLED_AI_PROVIDERS.includes(m.provider)) return false
            if (seenProviders.has(m.provider)) return false
            seenProviders.add(m.provider)
            return true
        })
        if (modelsToRun.length === 0) {
            logger.error(`[aiService] Scan for brand ${brandId}: no active AI model allowed for plan ${org?.plan || 'starter'}`)
            return []
        }

        // Every query x model pair runs concurrently; aiFetch caps in-flight calls per provider
        const pairs = queries.flatMap((queryText) => modelsToRun.map((model) => ({ queryText, model })))
        const answers = await Promise.all(
            pairs.map(async ({ queryText, model }) => ({
                queryText,
                model,
                rawText: await aiService.callModelCached(model.provider, model.modelId, queryText)
            }))
        )

        // Failed calls are dropped, not recorded as "not mentioned", so outages don't fake a visibility drop
        const results: IAiScanResult[] = answers
            .filter((a): a is typeof a & { rawText: string } => !!a.rawText)
            .map(({ queryText, model, rawText }) => {
                const parsed = aiService.parseMentionFromText(rawText, brandName)
                return {
                    brandId,
                    queryText,
                    model: model.name,
                    mentioned: parsed.mentioned,
                    position: parsed.position,
                    sentiment: parsed.sentiment,
                    rawResponse: rawText,
                    extractedAt: new Date()
                }
            })

        const failed = answers.length - results.length
        if (failed > 0) {
            logger.warn(`[aiService] Scan for brand ${brandId}: ${failed}/${answers.length} AI calls failed and were skipped`)
        }
        if (results.length === 0) {
            // Keep the previous scan as the latest; the scheduler lease retries this brand later
            logger.error(`[aiService] Scan for brand ${brandId} produced no answers (check API keys / provider status)`)
            return []
        }

        // Keep previous scans as history; readers use brand.lastScanId to get the latest set
        const scanId = randomUUID()
        const inserted = await mentionModel.insertMany(results.map((r) => ({ ...r, scanId })))

        const scannedAt = new Date()
        await brandModel.updateOne(
            { _id: brandId },
            { $set: { lastScanId: scanId, lastScannedAt: scannedAt, nextScanAt: getNextScanAt(org?.plan, scannedAt) } }
        )
        return inserted
    }
}

export default aiService
