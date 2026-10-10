import aiService from '../aiService'
import freeCheckModel from '../../model/freeCheckModel'
import { extractBrands } from '../brandExtractionService'
import { withAiCallContext } from '../costLogService'
import { istDay } from './helpers'
import { KEYS, redisStore, refund, type IFreeCheckStore } from './store'
import type { FreeCheckEngine, FreeCheckStatus, IFreeCheckAnswer } from '../../types/freeCheckTypes'
import logger from '../../util/loger'

// The scan models: the 6-hour response cache answers repeat questions for free
export const ENGINES: Array<{ engine: FreeCheckEngine; provider: string; modelId: string }> = [
    { engine: 'ChatGPT', provider: 'OpenAI', modelId: 'gpt-4o-mini' },
    { engine: 'Gemini', provider: 'Google', modelId: 'gemini-flash-latest' }
]

export interface IRunDeps {
    ask?: (provider: string, modelId: string, text: string) => Promise<string | null>
    extract?: typeof extractBrands
    store?: IFreeCheckStore
    send?: (to: string[], subject: string, text: string, html?: string) => Promise<unknown>
    now?: Date
}

export const runFreeCheck = async (checkId: string, deps: IRunDeps = {}): Promise<FreeCheckStatus> => {
    const ask = deps.ask ?? aiService.callModelCached
    const extract = deps.extract ?? extractBrands
    // Only a waiting check runs, once: a repeated job can't pay twice
    const check = await freeCheckModel.findOneAndUpdate(
        { checkId, status: { $in: ['queued', 'scheduled'] } },
        { $set: { status: 'running' } },
        { new: true }
    )
    if (!check) return 'failed'
    const giveBack = () => refund(deps.store ?? redisStore(), KEYS.global, istDay(deps.now)).catch(() => undefined)

    try {
        const pairs = check.questions.flatMap((q, qi) => ENGINES.map((e) => ({ qi, e, text: q.text })))
        const texts = await withAiCallContext({ purpose: 'free-check' }, () =>
            Promise.all(pairs.map((p) => ask(p.e.provider, p.e.modelId, p.text).catch(() => null)))
        )
        const answered = pairs.map((p, i) => ({ ...p, answer: texts[i] })).filter((p) => p.answer)
        const brands = answered.length
            ? await withAiCallContext({ purpose: 'free-check' }, () =>
                  extract(
                      answered.map((p, i) => ({ id: String(i), text: p.answer as string })),
                      check.brandName
                  )
              ).catch(() => new Map())
            : new Map()

        const questions = check.questions.map((q, qi) => ({
            text: q.text,
            answers: ENGINES.map((e): IFreeCheckAnswer => {
                const i = answered.findIndex((p) => p.qi === qi && p.e.engine === e.engine)
                if (i < 0) return { engine: e.engine, ok: false, named: false, position: null, brands: [] }
                const parsed = aiService.parseMentionFromText(answered[i].answer as string, check.brandName)
                return {
                    engine: e.engine,
                    ok: true,
                    named: parsed.mentioned,
                    position: parsed.position,
                    brands: ((brands.get(String(i)) || []) as Array<{ name: string }>).map((b) => b.name)
                }
            })
        }))
        const status: FreeCheckStatus = answered.length ? 'done' : 'failed'
        if (status === 'failed') await giveBack()
        await freeCheckModel.updateOne({ checkId }, { $set: { questions, status } })
        return status
    } catch (err) {
        logger.error(`[freeCheck] Run ${checkId} failed`, { meta: err })
        await giveBack()
        await freeCheckModel.updateOne({ checkId }, { $set: { status: 'failed' } })
        return 'failed'
    }
}
