// backend/src/service/reportService/reportData.ts
// Builds the snapshot a report is made of, from the brand's latest scan. The snapshot is stored on the
// report so a PDF downloaded later shows the numbers as they were when the report was created.
import brandModel from '../../model/brandModel'
import auditModel from '../../model/auditModel'
import recommendationModel from '../../model/recommendationModel'
import mentionModel from '../../model/mentionModel'
import { IMention } from '../../types/mentionTypes'
import { computeCompetitorStats } from '../competitorService'

export interface IReportEngine {
    name: string
    mentioned: number
    total: number
    score: number
    avgPosition: number | null
}

export interface IReportData {
    brandName: string
    website: string
    generatedAt: string
    scannedAt: string | null
    visibility: number
    previousVisibility: number | null
    engines: IReportEngine[]
    trend: Array<{ date: string; score: number }>
    questions: Array<{ text: string; results: Array<{ engine: string; position: number | null; mentioned: boolean }> }>
    shareOfVoice: Array<{ name: string; count: number; pct: number; isYou: boolean }> | null
    audit: {
        healthScore: number
        crawlers: Array<{ name: string; status: string; badgeType: string }>
        schema: Array<{ name: string; status: string; badgeType: string }>
    } | null
    recommendations: Array<{ text: string; impact: string }>
}

// Stored model names ("OpenAI GPT-4o Mini", "Grok 3 Mini"...) shown as the assistant people know
export const engineLabel = (model: string) => {
    const m = model.toLowerCase()
    if (m.includes('gpt') || m.includes('openai')) return 'ChatGPT'
    if (m.includes('gemini')) return 'Gemini'
    if (m.includes('claude')) return 'Claude'
    if (m.includes('grok')) return 'Grok'
    if (m.includes('deepseek')) return 'DeepSeek'
    if (m.includes('perplexity') || m.includes('sonar')) return 'Perplexity'
    return model
}

const ENGINE_ORDER = ['ChatGPT', 'Gemini', 'Claude', 'Grok', 'DeepSeek', 'Perplexity']
const byEngineOrder = (a: string, b: string) => {
    const ia = ENGINE_ORDER.indexOf(a)
    const ib = ENGINE_ORDER.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b)
}

export const buildReportData = async (brandId: string): Promise<IReportData> => {
    const brand = await brandModel.findById(brandId).lean()
    if (!brand) throw new Error(`Brand ${brandId} not found`)

    // Latest scan only (legacy brands without scan history fall back to all their mentions)
    const mentions: IMention[] = brand.lastScanId
        ? await mentionModel.find({ brandId, scanId: brand.lastScanId }).lean()
        : await mentionModel.find({ brandId }).lean()

    // Per engine
    const engineMap = new Map<string, { mentioned: number; total: number; positions: number[] }>()
    for (const m of mentions) {
        const name = engineLabel(m.model)
        const e = engineMap.get(name) || { mentioned: 0, total: 0, positions: [] }
        e.total++
        if (m.mentioned) {
            e.mentioned++
            if (m.position) e.positions.push(m.position)
        }
        engineMap.set(name, e)
    }
    const engines: IReportEngine[] = [...engineMap.entries()]
        .map(([name, e]) => ({
            name,
            mentioned: e.mentioned,
            total: e.total,
            score: e.total ? Math.round((e.mentioned / e.total) * 100) : 0,
            avgPosition: e.positions.length ? Math.round((e.positions.reduce((a, b) => a + b, 0) / e.positions.length) * 10) / 10 : null
        }))
        .sort((a, b) => byEngineOrder(a.name, b.name))

    // Same blend as the dashboard headline: average of per-engine visibility
    const visibility = engines.length ? Math.round(engines.reduce((a, e) => a + e.score, 0) / engines.length) : 0

    // Imported lazily: databseService also imports this module to create reports
    const databseService = (await import('../databseService')).default
    const trendPoints = await databseService.getVisibilityTrendByBrandId(brandId, 12)
    const trend = trendPoints.map((t) => ({ date: new Date(t.scannedAt).toISOString(), score: t.score }))
    const previousVisibility = trendPoints.length >= 2 ? trendPoints[trendPoints.length - 2].score : null

    // Per question, one cell per engine
    const questionMap = new Map<string, Map<string, { position: number | null; mentioned: boolean }>>()
    for (const m of mentions) {
        const row = questionMap.get(m.queryText) || new Map()
        row.set(engineLabel(m.model), { position: m.mentioned ? (m.position ?? null) : null, mentioned: !!m.mentioned })
        questionMap.set(m.queryText, row)
    }
    const engineNames = engines.map((e) => e.name)
    const questions = [...questionMap.entries()].map(([text, row]) => ({
        text,
        results: engineNames.map((engine) => ({ engine, ...(row.get(engine) || { position: null, mentioned: false }) }))
    }))

    // Share of voice: same calculation as the Competitors page. Needs stored answer text
    const competitors = (brand.competitors || []).map((c) => c.name).filter(Boolean)
    const stats = computeCompetitorStats(brand.name, competitors, mentions)
    const shareOfVoice: IReportData['shareOfVoice'] = stats.answerTextAvailable
        ? stats.rows.map((r) => ({ name: r.name, count: r.answersNamed, pct: r.share, isYou: r.isYou })).sort((x, y) => y.count - x.count)
        : null

    const audit = await auditModel.findOne({ brandId }).lean()
    const recs = await recommendationModel.find({ brandId, isCompleted: { $ne: true } }).lean()
    const impactRank: Record<string, number> = { 'High impact': 0, 'Medium impact': 1, 'Low impact': 2 }

    return {
        brandName: brand.name,
        website: brand.website,
        generatedAt: new Date().toISOString(),
        scannedAt: brand.lastScannedAt ? new Date(brand.lastScannedAt).toISOString() : null,
        visibility,
        previousVisibility,
        engines,
        trend,
        questions,
        shareOfVoice,
        audit: audit
            ? {
                  healthScore: audit.healthScore,
                  crawlers: (audit.crawlerAccess || []).map((c) => ({ name: c.name, status: c.status, badgeType: c.badgeType || 'badge-warn' })),
                  schema: (audit.structuredData || []).map((c) => ({ name: c.name, status: c.status, badgeType: c.badgeType || 'badge-warn' }))
              }
            : null,
        recommendations: recs
            .sort((a, b) => (impactRank[a.impact] ?? 3) - (impactRank[b.impact] ?? 3))
            .slice(0, 6)
            .map((r) => ({ text: r.text, impact: r.impact }))
    }
}
