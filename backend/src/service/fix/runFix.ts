import generatedFixModel from '../../model/generatedFixModel'
import brandModel from '../../model/brandModel'
import mentionModel from '../../model/mentionModel'
import config from '../../config/config'
import aiService from '../aiService'
import logger from '../../util/loger'
import { auditService } from '../auditService'
import { withAiCallContext } from '../costLogService'
import { computeLostTo, loadScanPair, nameMatcher, type ILostTo } from '../competitorService'
import { pickOwnUrls, wonQueries } from './pickPages'
import { homepageLinks, readPages } from './readPages'
import { buildFixPrompt, parseFixResponse } from './prompt'
import type { IBrandProduct } from '../../types/brandTypes'
import type { IMention } from '../../types/mentionTypes'

export interface IFixDeps {
    // Omitted: the page readers use their own SSRF-safe fetch
    fetch?: (url: string) => Promise<string>
    ai: (prompt: string) => Promise<string | null>
    byQuestion: (brandId: string, brandName: string, competitors: string[]) => Promise<ILostTo['byQuestion']>
    aiSaid: (brandId: string, competitor: string) => Promise<string[]>
}

const MAX_TOKENS = 4000

const defaultDeps: IFixDeps = {
    ai: async (prompt) =>
        (await aiService.callClaude(prompt, MAX_TOKENS, config.FIX_MODEL_CLAUDE)) ??
        (await aiService.callOpenAiCompatible('OpenAI', prompt, config.FIX_MODEL_OPENAI, MAX_TOKENS)),
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
    const fix = await generatedFixModel.findById(fixId).lean()
    if (!fix || fix.status !== 'pending') return
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

        let ownUrls = pickOwnUrls({ type: fix.type, kind: fix.kind, competitor: fix.competitor, products, byQuestion })
        if (!ownUrls.length) ownUrls = await homepageLinks(home, d.fetch)
        const own = await readPages(ownUrls, d.fetch)

        let theirs: Awaited<ReturnType<typeof readPages>> = { pages: [], read: [] }
        let aiSaid: string[] = []
        if (fix.type === 'comparison' && fix.competitor) {
            const site = competitors.find((c) => c.name === fix.competitor)?.website
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
            aiSaid
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
