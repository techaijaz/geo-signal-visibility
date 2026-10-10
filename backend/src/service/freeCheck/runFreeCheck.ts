import aiService from '../aiService'
import freeCheckModel from '../../model/freeCheckModel'
import { extractBrands } from '../brandExtractionService'
import { withAiCallContext } from '../costLogService'
import { istDay, nextMorningIst } from './helpers'
import { KEYS, consume, redisStore, refund, type IFreeCheckStore } from './store'
import { getSetting } from '../../model/appSettingModel'
import { enqueueFreeCheckJob } from '../queueService'
import type { FreeCheckEngine, FreeCheckStatus, IFreeCheckAnswer } from '../../types/freeCheckTypes'
import logger from '../../util/loger'
import emailService from '../emailService'
import { reportEmail } from './emails'

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
    limit?: number
    enqueue?: (checkId: string, runAt?: Date) => Promise<unknown>
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
    const store = deps.store ?? redisStore()

    // A next-morning run takes its place in that day's budget; over it, it waits for the next morning again
    let budgetDay = check.budgetDay
    if (!budgetDay) {
        const day = istDay(deps.now)
        const limit = deps.limit ?? (await getSetting('freeCheckDailyLimit', 150))
        if (!(await consume(store, KEYS.global, limit, day))) {
            await freeCheckModel.updateOne({ checkId }, { $set: { status: 'scheduled' } })
            await (deps.enqueue ?? enqueueFreeCheckJob)(checkId, nextMorningIst(deps.now))
            return 'scheduled'
        }
        budgetDay = day
        await freeCheckModel.updateOne({ checkId }, { $set: { budgetDay } })
    }
    // Gives back only what this check took
    const giveBack = () => refund(store, KEYS.global, budgetDay as string).catch(() => undefined)

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
        // A check that ran the next morning was verified already: its report goes out now
        // Read again: the email may have been verified while the check was running
        const done = status === 'done' ? await freeCheckModel.findOne({ checkId }).lean() : null
        if (done?.verifiedAt && done.email) {
            const send = deps.send ?? ((to, s, t, h) => emailService.sendEmail(to, s, t, { html: h }))
            const mail = reportEmail(done, done.email, Boolean(done.consentRequested))
            await send([done.email], mail.subject, mail.text, mail.html).catch((e) => logger.warn('[freeCheck] report email failed', { meta: e }))
        }
        return status
    } catch (err) {
        logger.error(`[freeCheck] Run ${checkId} failed`, { meta: err })
        await giveBack()
        await freeCheckModel.updateOne({ checkId }, { $set: { status: 'failed' } })
        return 'failed'
    }
}
