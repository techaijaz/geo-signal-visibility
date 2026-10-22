import generatedFixModel from '../../model/generatedFixModel'
import brandModel from '../../model/brandModel'
import mentionModel from '../../model/mentionModel'
import config from '../../config/config'
import aiService from '../aiService'
import logger from '../../util/loger'
import { auditService } from '../auditService'
import { withAiCallContext } from '../costLogService'
import { brandKey, computeLostTo, loadScanPair, nameMatcher, type ILostTo } from '../competitorService'
import { pickOwnUrls, wonQueries } from './pickPages'
import { homepageLinks, llmsUrls, readPages } from './readPages'
import { buildFixPrompt, parseFixResponse } from './prompt'
import { siteProfile } from '../siteProfile'
import type { IBrandProduct } from '../../types/brandTypes'
import type { IMention } from '../../types/mentionTypes'

export interface IFixDeps {
    // Omitted: the page readers use their own SSRF-safe fetch
    fetch?: (url: string) => Promise<string>
    ai: (prompt: string) => Promise<string | null>
    byQuestion: (brandId: string, brandName: string, competitors: string[]) => Promise<ILostTo['byQuestion']>
    aiSaid: (brandId: string, competitor: string) => Promise<string[]>
}

// Room for 12 answers in Hindi; a long answer takes over a minute, and a retry would pay for it again
const MAX_TOKENS = 8000
const HTTP = { timeoutMs: 120000, retries: 0 }
// A job not picked up within this long (queue backlog) fails, so every run ends inside the usage window
const START_WINDOW_MS = 5 * 60 * 1000

export const fixAi = async (prompt: string) =>
    (await aiService.callClaude(prompt, MAX_TOKENS, config.FIX_MODEL_CLAUDE, HTTP)) ??
    (await aiService.callOpenAiCompatible('DeepSeek', prompt, config.FIX_MODEL_DEEPSEEK, MAX_TOKENS, HTTP))

const defaultDeps: IFixDeps = {
    ai: fixAi,
    byQuestion: async (brandId, brandName, competitors) => {
        const brand = await brandModel.findById(brandId).select('lastScanId').lean()
        const { current } = await loadScanPair(brandId, (brand as { lastScanId?: string } | null)?.lastScanId)
        return computeLostTo(current as IMention[], brandName, competitors, []).byQuestion
    },
    // Sentences from stored AI answers that name the competitor
    aiSaid: async (brandId, competitor) => {
        const re = nameMatcher(competitor)
        const rows = await mentionModel.find({ brandId }).sort({ createdAt: -1 }).limit(60).select('rawText').lean()
        return rows
            .flatMap((m) => String((m as { rawText?: string }).rawText || '').split(/(?<=[.!?])\s+/))
            .filter((s) => re.test(s))
            .slice(0, 5)
    }
}

const finish = (id: string, update: object) => generatedFixModel.updateOne({ _id: id }, { ...update, finishedAt: new Date() })

export const runFix = async (fixId: string, deps: Partial<IFixDeps> = {}) => {
    const d = { ...defaultDeps, ...deps }
    // Claim the job once: a duplicate delivery finds it already started, a late one fails
    const fix = await generatedFixModel
        .findOneAndUpdate(
            { _id: fixId, status: 'pending', startedAt: null, createdAt: { $gte: new Date(Date.now() - START_WINDOW_MS) } },
            { startedAt: new Date() },
            { new: true }
        )
        .lean()
    if (!fix) {
        await generatedFixModel.updateOne(
            { _id: fixId, status: 'pending', startedAt: null },
            { status: 'failed', error: 'Took too long to start, try again', finishedAt: new Date() }
        )
        return
    }
    try {
        const brand = await brandModel.findById(fix.brandId).lean()
        if (!brand) return void (await finish(fixId, { status: 'failed', error: 'Brand not found' }))
        const products = ((brand as { products?: IBrandProduct[] }).products ?? []) as IBrandProduct[]
        const competitors = (brand as { competitors?: Array<{ name: string; website?: string }> }).competitors ?? []
        const home = auditService.cleanUrl(String((brand as { website?: string }).website || ''))
        const byQuestion =
            fix.type === 'comparison'
                ? await d.byQuestion(
                      String(fix.brandId),
                      brand.name,
                      competitors.map((c) => c.name)
                  )
                : []

        const { sellsProducts } = siteProfile(brand as Parameters<typeof siteProfile>[0])
        let ownUrls =
            fix.type === 'llms'
                ? await llmsUrls(home, products, sellsProducts, d.fetch)
                : pickOwnUrls({ type: fix.type, kind: fix.kind, competitor: fix.competitor, products, byQuestion })
        if (!ownUrls.length) ownUrls = await homepageLinks(home, d.fetch)
        // A whole-brand FAQ also reads the homepage (shipping, returns, what the brand stands for)
        else if (fix.type === 'faq' && !fix.kind && home && !ownUrls.includes(home)) ownUrls = [home, ...ownUrls]
        const own = await readPages(ownUrls, d.fetch)

        let theirs: Awaited<ReturnType<typeof readPages>> = { pages: [], read: [] }
        let aiSaid: string[] = []
        if (fix.type === 'comparison' && fix.competitor) {
            const site = competitors.find((c) => brandKey(c.name) === brandKey(fix.competitor ?? ''))?.website
            if (site) theirs = await readPages(await homepageLinks(auditService.cleanUrl(site), d.fetch, 3), d.fetch)
            aiSaid = await d.aiSaid(String(fix.brandId), fix.competitor)
        }

        const pagesRead = [...own.read, ...theirs.read]
        if (!own.pages.length) {
            return void (await finish(fixId, { status: 'failed', pagesRead, error: `Couldn't open pages on your site: ${ownUrls[0] || home}` }))
        }

        const questions =
            fix.type === 'comparison'
                ? wonQueries(byQuestion, fix.competitor ?? '')
                : ((brand as { queries?: Array<{ text: string }> }).queries ?? []).map((q) => q.text)
        const prompt = buildFixPrompt({
            type: fix.type,
            brandName: brand.name,
            competitor: fix.competitor,
            kind: fix.kind,
            language: fix.language,
            questions,
            pages: own.pages,
            competitorPages: theirs.pages,
            aiSaid,
            sellsProducts
        })
        const allowed = [...own.pages, ...theirs.pages].map((p) => p.url)
        let parsed = null
        for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
            const raw = await withAiCallContext({ brandId: String(fix.brandId), purpose: 'fix' }, () => d.ai(prompt))
            parsed = raw ? parseFixResponse(raw, fix.type, allowed) : null
        }
        if (!parsed) return void (await finish(fixId, { status: 'failed', pagesRead, error: "Couldn't write this one, try again" }))

        const okCount = own.read.filter((r) => r.ok).length
        await finish(fixId, {
            status: 'done',
            pagesRead,
            title: parsed.title,
            items: parsed.items,
            note: okCount < own.read.length ? `Read ${okCount} of ${own.read.length} pages` : null
        })
    } catch (err) {
        logger.error('[fix] generation failed', { meta: { fixId, err } })
        await finish(fixId, { status: 'failed', error: "Couldn't write this one, try again" })
    }
}
