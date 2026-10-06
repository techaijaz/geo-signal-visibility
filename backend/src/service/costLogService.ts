import { AsyncLocalStorage } from 'async_hooks'
import aiModel from '../model/aiModel'
import costLogModel from '../model/costLogModel'
import logger from '../util/loger'

interface IAiCallContext {
    brandId?: string
    purpose: 'scan' | 'recommendations' | 'brands' | 'products'
}

// Which brand and feature the AI calls inside a run belong to, without passing it through every function
const aiCallContext = new AsyncLocalStorage<IAiCallContext>()
export const withAiCallContext = <T>(context: IAiCallContext, fn: () => Promise<T>) => aiCallContext.run(context, fn)

// USD per 1k tokens, from the AI Models admin page; re-read every few minutes so price edits apply
const PRICE_TTL_MS = 5 * 60 * 1000
let prices: { at: number; byModelId: Map<string, { input: number; output: number }> } | null = null

const priceFor = async (modelId: string) => {
    if (!prices || Date.now() - prices.at > PRICE_TTL_MS) {
        const models = await aiModel.find().select('modelId inputCostPer1k outputCostPer1k').lean()
        prices = {
            at: Date.now(),
            byModelId: new Map(models.map((m) => [m.modelId, { input: m.inputCostPer1k ?? 0, output: m.outputCostPer1k ?? 0 }]))
        }
    }
    return prices.byModelId.get(modelId)
}

export interface IAiUsage {
    provider: string
    model: string
    inputTokens: number
    outputTokens: number
    latencyMs: number
    prompt: string
}

// Never throws: a failed log must not fail the scan
export const recordAiUsage = async (usage: IAiUsage) => {
    try {
        const context = aiCallContext.getStore()
        const price = await priceFor(usage.model)
        if (!price) logger.warn(`[costLog] No price for model "${usage.model}"; add it on the AI Models page`)
        const cost = price ? (usage.inputTokens / 1000) * price.input + (usage.outputTokens / 1000) * price.output : 0
        await costLogModel.create({
            brandId: context?.brandId,
            purpose: context?.purpose,
            provider: usage.provider,
            model: usage.model,
            queryText: usage.prompt.slice(0, 300),
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            tokensUsed: usage.inputTokens + usage.outputTokens,
            cost,
            latencyMs: usage.latencyMs
        })
    } catch (error) {
        logger.warn('[costLog] Failed to record AI usage', { meta: error })
    }
}
