// Brand names an AI answer recommends, for the lost-to list. One cheap AI call per 10 answers;
// the AI only proposes names, the answer text decides what is kept and where it sits.
import aiService from './aiService'
import { nameMatcher, positionIn } from './competitorService'
import { IBrandNamed } from '../types/mentionTypes'
import logger from '../util/loger'

const CHUNK = 10

export const validateNames = (names: unknown, text: string, ownBrand: string): IBrandNamed[] => {
    if (!Array.isArray(names)) return []
    const own = ownBrand.trim().toLowerCase()
    const seen = new Set<string>()
    const out: IBrandNamed[] = []
    for (const raw of names) {
        if (typeof raw !== 'string') continue
        const name = raw.replace(/\s+/g, ' ').trim()
        const key = name.toLowerCase()
        if (!name || key === own || seen.has(key)) continue
        const re = nameMatcher(name)
        if (!re.test(text)) continue
        seen.add(key)
        out.push({ name, position: positionIn(text, re) })
    }
    return out
}

const promptFor = (texts: string[]) => `For each numbered answer below, list the brand or company names it recommends or mentions.
Use the short brand name ("Ajmal", not "Ajmal Dahn Al Oudh"). Do not list product names, shops or generic words.
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
