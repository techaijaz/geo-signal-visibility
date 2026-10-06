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
import { recordAiUsage, withAiCallContext } from './costLogService'
import { saveBrandsNamed } from './brandExtractionService'
import { linePosition } from '../util/listPosition'

interface IOpenAiChatResponse {
    choices?: Array<{
        message?: {
            content?: string
        }
    }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
}

interface IGeminiResponse {
    candidates?: Array<{
        content?: {
            parts?: Array<{
                text?: string
            }>
        }
    }>
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

interface IClaudeResponse {
    content?: Array<{
        text?: string
    }>
    usage?: { input_tokens?: number; output_tokens?: number }
}

export interface IAiScanResult {
    brandId: string
    queryText: string
    model: string
    mentioned: boolean
    position: number | null
    sentiment: 'Positive' | 'Neutral' | 'Negative'
    rawText?: string
    extractedAt: Date
}

const SYSTEM_PROMPT = 'You are an AI search engine assistant providing authoritative recommendations for brands, products, software, and services.'

interface IOpenAiCompatibleProvider {
    keyName: string // API key record / aiFetch concurrency bucket
    url: () => string
    defaultModel: () => string
    fallbackModel?: string // retried once when the requested model returns an error
    extraHeaders?: () => Record<string, string>
    extraBody?: Record<string, unknown>
}

// Keyed by aiModel.provider
const OPENAI_COMPATIBLE_PROVIDERS: Record<string, IOpenAiCompatibleProvider> = {
    OpenAI: {
        keyName: 'OPENAI',
        url: () => 'https://api.openai.com/v1/chat/completions',
        defaultModel: () => config.AI_MODELS.OPENAI || 'gpt-4o-mini'
    },
    DeepSeek: {
        keyName: 'DEEPSEEK',
        url: () => 'https://api.deepseek.com/chat/completions',
        defaultModel: () => config.AI_MODELS.DEEPSEEK || 'deepseek-v4-flash',
        fallbackModel: 'deepseek-chat',
        // v4 models think before answering; within our token budget that left the answer empty
        extraBody: { temperature: 0.7, thinking: { type: 'disabled' } }
    },
    Perplexity: {
        keyName: 'PERPLEXITY',
        url: () => 'https://api.perplexity.ai/chat/completions',
        defaultModel: () => config.AI_MODELS.PERPLEXITY || 'sonar'
    },
    xAI: {
        keyName: 'XAI',
        url: () => 'https://api.x.ai/v1/chat/completions',
        defaultModel: () => config.AI_MODELS.GROK || 'grok-3-mini'
    },
    OpenRouter: {
        keyName: 'OPENROUTER',
        url: () => 'https://openrouter.ai/api/v1/chat/completions',
        defaultModel: () => 'openai/gpt-4o-mini',
        extraHeaders: () => ({ 'HTTP-Referer': config.FRONTEND_URL || 'http://localhost:5173', 'X-Title': 'GEO Dashboard' })
    },
    OmniRoute: {
        keyName: 'OMNIROUTE',
        url: () => config.OMNIROUTE_BASE_URL,
        defaultModel: () => config.AI_MODELS.OMNIROUTE || 'omniroute-auto'
    }
}

const GEMINI_FALLBACK_MODEL = 'gemini-flash-latest'

// Without this a failed call only showed up as "n/m AI calls failed"; the provider's message says why
// (no credits, retired model, bad key...)
const logProviderFailure = async (provider: string, model: string, response: Response) => {
    const body = await response.text().catch(() => '')
    logger.warn(`[aiService] ${provider} ${model} returned ${response.status}: ${body.replace(/\s+/g, ' ').slice(0, 300)}`)
}

const aiService = {
    /**
     * Call any OpenAI-compatible chat completions API (OpenAI, DeepSeek, Perplexity, xAI Grok, OpenRouter, OmniRoute)
     */
    callOpenAiCompatible: async (provider: string, prompt: string, modelOverride?: string, maxTokens = 400): Promise<string | null> => {
        const spec = OPENAI_COMPATIBLE_PROVIDERS[provider]
        if (!spec) return null
        const apiKey = await databseService.getDecryptedApiKey(spec.keyName)
        if (!apiKey) return null
        const model = modelOverride || spec.defaultModel()
        try {
            const startedAt = Date.now()
            const response = await aiFetch(spec.keyName, spec.url(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                    ...spec.extraHeaders?.()
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: maxTokens,
                    ...spec.extraBody
                })
            })
            if (!response.ok) {
                await logProviderFailure(provider, model, response)
                if (spec.fallbackModel && model !== spec.fallbackModel) {
                    return aiService.callOpenAiCompatible(provider, prompt, spec.fallbackModel, maxTokens)
                }
                return null
            }
            const data = (await response.json()) as IOpenAiChatResponse
            await recordAiUsage({
                provider,
                model,
                inputTokens: data.usage?.prompt_tokens ?? 0,
                outputTokens: data.usage?.completion_tokens ?? 0,
                latencyMs: Date.now() - startedAt,
                prompt
            })
            return data.choices?.[0]?.message?.content || null
        } catch (error) {
            logger.error(`${provider} API Error:`, { meta: error })
            return null
        }
    },

    /**
     * Call Google Gemini API
     */
    callGemini: async (prompt: string, modelOverride?: string, maxTokens = 400): Promise<string | null> => {
        const apiKey = await databseService.getDecryptedApiKey('GEMINI')
        if (!apiKey) return null
        const modelName = (modelOverride || config.AI_MODELS.GEMINI).trim()

        const generate = (model: string) =>
            aiFetch('GEMINI', `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    // Flash models think before answering by default, and the thinking counts against
                    // maxOutputTokens, which cut answers off after a few words
                    generationConfig: { maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } }
                })
            })

        try {
            const startedAt = Date.now()
            let usedModel = modelName
            let response = await generate(modelName)
            if (!response.ok) {
                await logProviderFailure('Gemini', modelName, response)
                // Google retires model versions; the -latest alias always points at a current one
                if (modelName === GEMINI_FALLBACK_MODEL) return null
                usedModel = GEMINI_FALLBACK_MODEL
                response = await generate(GEMINI_FALLBACK_MODEL)
                if (!response.ok) {
                    await logProviderFailure('Gemini', GEMINI_FALLBACK_MODEL, response)
                    return null
                }
            }
            const data = (await response.json()) as IGeminiResponse
            await recordAiUsage({
                provider: 'Google',
                model: usedModel,
                inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
                outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
                latencyMs: Date.now() - startedAt,
                prompt
            })
            // An answer can come back in several parts
            return (
                data.candidates?.[0]?.content?.parts
                    ?.map((p) => p.text || '')
                    .join('')
                    .trim() || null
            )
        } catch (error) {
            logger.error('Gemini API Error:', { meta: error })
            return null
        }
    },

    /**
     * Call Anthropic Claude API
     */
    callClaude: async (prompt: string, maxTokensOverride?: number, modelOverride?: string): Promise<string | null> => {
        const apiKey = await databseService.getDecryptedApiKey('ANTHROPIC')
        if (!apiKey) return null
        const modelName = modelOverride || config.AI_MODELS.CLAUDE || 'claude-haiku-4-5-20251001'
        try {
            const startedAt = Date.now()
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
            if (!response.ok) {
                await logProviderFailure('Claude', modelName, response)
                return null
            }
            const data = (await response.json()) as IClaudeResponse
            await recordAiUsage({
                provider: 'Anthropic',
                model: modelName,
                inputTokens: data.usage?.input_tokens ?? 0,
                outputTokens: data.usage?.output_tokens ?? 0,
                latencyMs: Date.now() - startedAt,
                prompt
            })
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
        const geminiRes = await aiService.callGemini(prompt, undefined, maxTokens)
        if (geminiRes) return geminiRes

        const openaiRes = await aiService.callOpenAiCompatible('OpenAI', prompt, undefined, maxTokens)
        if (openaiRes) return openaiRes

        const claudeRes = await aiService.callClaude(prompt, maxTokens)
        if (claudeRes) return claudeRes

        const deepseekRes = await aiService.callOpenAiCompatible('DeepSeek', prompt, undefined, maxTokens)
        if (deepseekRes) return deepseekRes

        return null
    },

    /**
     * Route a query to the configured provider for a tracked model
     */
    callModel: async (provider: string, modelId: string, queryText: string): Promise<string | null> => {
        if (config.DISABLED_AI_PROVIDERS.includes(provider)) return null
        if (provider === 'Google') return aiService.callGemini(queryText, modelId)
        if (provider === 'Anthropic') return aiService.callClaude(queryText, undefined, modelId)
        if (OPENAI_COMPATIBLE_PROVIDERS[provider]) return aiService.callOpenAiCompatible(provider, queryText, modelId)
        logger.warn(`[aiService] No client for AI provider "${provider}", skipping`)
        return null
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
                position = linePosition(lines, i)
                break
            }
        }

        // Sentiment classification
        let sentiment: 'Positive' | 'Neutral' | 'Negative' = 'Neutral'
        const positiveKeywords = ['best', 'top', 'great', 'excellent', 'highly recommended', 'popular', 'effective', 'fav', 'love']
        const negativeKeywords = ['bad', 'avoid', 'poor', 'expensive', 'overrated', 'issue', 'problem', 'disappointing']

        const positiveCount = positiveKeywords.filter((k) => lowerText.includes(k)).length
        const negativeCount = negativeKeywords.filter((k) => lowerText.includes(k)).length

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

        const org = await orgModel.findById(brand.orgId).select('plan')
        const planLimits = getPlanLimits((org?.plan || 'free') as PlanName)

        // Only enabled queries, capped at the plan limit (covers downgrades and legacy brands over the cap)
        const enabledQueries = (brand.queries || []).filter((q) => q.enabled !== false).map((q) => q.text)
        const queries = (enabledQueries.length > 0 ? enabledQueries : defaultQueries).slice(0, planLimits.maxQueries)
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
        const failScan = (message: string) =>
            brandModel.updateOne({ _id: brandId }, { $set: { lastScanError: { message, at: new Date() } } }).then(() => [])

        if (modelsToRun.length === 0) {
            logger.error(`[aiService] Scan for brand ${brandId}: no active AI model allowed for plan ${org?.plan || 'free'}`)
            return failScan('No AI engine is available for your plan right now, so the scan could not run. Please contact support.')
        }

        // Every query x model pair runs concurrently; aiFetch caps in-flight calls per provider
        const pairs = queries.flatMap((queryText) => modelsToRun.map((model) => ({ queryText, model })))
        const answers = await withAiCallContext({ brandId, purpose: 'scan' }, () =>
            Promise.all(
                pairs.map(async ({ queryText, model }) => ({
                    queryText,
                    model,
                    rawText: await aiService.callModelCached(model.provider, model.modelId, queryText)
                }))
            )
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
                    rawText,
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
            return failScan(
                'None of the AI engines answered, so this scan saved no results. Any earlier results are kept, and we will retry automatically.'
            )
        }

        // Keep previous scans as history; readers use brand.lastScanId to get the latest set
        const scanId = randomUUID()
        const inserted = await mentionModel.insertMany(results.map((r) => ({ ...r, scanId })))
        // Who AI recommends instead of the brand (lost-to list); never fails the scan
        await withAiCallContext({ brandId, purpose: 'brands' }, () => saveBrandsNamed(inserted, brandName))

        const scannedAt = new Date()
        await brandModel.updateOne(
            { _id: brandId },
            { $set: { lastScanId: scanId, lastScannedAt: scannedAt, nextScanAt: getNextScanAt(org?.plan, scannedAt), lastScanError: null } }
        )
        return inserted
    }
}

export default aiService
