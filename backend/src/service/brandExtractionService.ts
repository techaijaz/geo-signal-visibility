// Brand names an AI answer recommends, for the lost-to list. One cheap AI call per 10 answers;
// the AI only proposes names, the answer text decides what is kept and where it sits.
import aiService from './aiService'
import mentionModel from '../model/mentionModel'
import { brandKey, isNotBrand, nameMatcher, positionIn } from './competitorService'
import { IBrandNamed } from '../types/mentionTypes'
import logger from '../util/loger'

const CHUNK = 10

export const validateNames = (names: unknown, text: string, ownBrand: string): IBrandNamed[] => {
    if (!Array.isArray(names)) return []
    const own = brandKey(ownBrand)
    const seen = new Set<string>()
    const out: IBrandNamed[] = []
    for (const raw of names) {
        if (typeof raw !== 'string') continue
        const name = raw.replace(/\s+/g, ' ').trim()
        const key = brandKey(name)
        if (!key || key === own || seen.has(key) || isNotBrand(name)) continue
        const re = nameMatcher(name)
        if (!re.test(text)) continue
        seen.add(key)
        out.push({ name, position: positionIn(text, re) })
    }
    return out
}

const promptFor = (texts: string[]) => `For each numbered answer below, list the brand or company names it recommends or mentions.
Use the short brand name ("Ajmal", not "Ajmal Dahn Al Oudh"). Do not list product names, generic words, or shops and marketplaces (Amazon, Flipkart, Nykaa, Myntra...).
Reply with JSON only: {"0": ["Brand", ...], "1": [...], ...}. Use [] when an answer names no brand.

${texts.map((t, i) => `### ${i}\n${t.slice(0, 3000)}`).join('\n\n')}`

const parseJson = (s: string | null): Record<string, unknown> | null => {
    if (!s) return null
    try {
        const match = s.match(/\{[\s\S]*\}/)
        return JSON.parse(match ? match[0] : s)
    } catch {
        return null
    }
}

export const extractBrands = async (answers: { id: string; text: string }[], ownBrand: string) => {
    const result = new Map<string, IBrandNamed[]>()
    for (let i = 0; i < answers.length; i += CHUNK) {
        const chunk = answers.slice(i, i + CHUNK)
        const parsed = parseJson(await aiService.callAnyAvailableAi(promptFor(chunk.map((a) => a.text)), 1500))
        if (!parsed) logger.warn(`[brandExtraction] No usable JSON for answers ${i}-${i + chunk.length - 1}`)
        chunk.forEach((a, j) => result.set(a.id, validateNames(parsed?.[String(j)], a.text, ownBrand)))
    }
    return result
}

// Never throws: a failed extraction leaves brandsNamed unset and the scan stands
export const saveBrandsNamed = async (mentions: Array<{ _id: unknown; rawText?: string }>, ownBrand: string) => {
    try {
        const withText = mentions.filter((m) => m.rawText)
        if (!withText.length) return
        const found = await extractBrands(
            withText.map((m) => ({ id: String(m._id), text: m.rawText as string })),
            ownBrand
        )
        await mentionModel.bulkWrite(
            withText.map((m) => ({
                updateOne: { filter: { _id: m._id }, update: { $set: { brandsNamed: found.get(String(m._id)) ?? [] } } }
            }))
        )
    } catch (error) {
        logger.warn('[brandExtraction] Failed, brand names skipped for this scan', { meta: error })
    }
}
