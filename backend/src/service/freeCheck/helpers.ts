import crypto from 'crypto'
import config from '../../config/config'
import { detectVertical, verticalOfText } from '../querySuggestionService'
import { brandKey } from '../competitorService'
import type { IFreeCheck } from '../../types/freeCheckTypes'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const DISPOSABLE: Set<string> = new Set(require('disposable-email-domains') as string[])

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$)/i

// Full site address for the checker; the domain (no www.) is what cache and limits count
export const normaliseSiteUrl = (input: string): { url: string; domain: string } | null => {
    const raw = (input || '').trim()
    if (!raw || /\s/.test(raw)) return null
    try {
        const u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`)
        if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.') || PRIVATE_HOST.test(u.hostname)) return null
        const host = u.hostname.toLowerCase()
        return { url: `${u.protocol}//${host}${u.pathname || '/'}`, domain: host.replace(/^www\./, '') }
    } catch {
        return null
    }
}

const meta = (html: string, re: RegExp) => (html.match(re)?.[1] || '').replace(/&amp;/g, '&').trim()

// Brand name and category from the homepage, without an AI call
export const siteFacts = (html: string, categories: string[]): { brandName: string; category: string } => {
    const site = meta(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i)
    const title = meta(html, /<title[^>]*>([^<]*)<\/title>/i)
    const description = meta(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)
    const h1 = meta(html, /<h1[^>]*>([^<]*)<\/h1>/i)
    // "Buy Attar Online | Hasan Oud" → og:site_name, else the shortest title part
    const parts = title
        .split(/\s[|–—-]\s/)
        .map((p) => p.trim())
        .filter(Boolean)
    const brandName = site || (parts.length ? parts.reduce((a, b) => (b.length < a.length ? b : a)) : '')
    const vertical = verticalOfText(`${title} ${description} ${h1}`)
    const category = vertical ? categories.find((c) => detectVertical(c) === vertical) || '' : ''
    return { brandName: brandName.slice(0, 80), category }
}

const IST_OFFSET_MS = 330 * 60 * 1000
export const istDay = (now = new Date()) => new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
export const nextMorningIst = (now = new Date()) => {
    const day = istDay(new Date(now.getTime() + 24 * 60 * 60 * 1000))
    return new Date(new Date(`${day}T06:00:00.000Z`).getTime() - IST_OFFSET_MS)
}

const salt = () => process.env.FREE_CHECK_SALT || config.ACCESS_TOKEN.SECRET || 'dev'
export const newCheckId = () => crypto.randomBytes(24).toString('base64url')
export const hashIp = (ip: string) => crypto.createHash('sha256').update(`${salt()}:${ip}`).digest('hex')
export const newOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
export const hashOtp = (code: string, checkId: string) => crypto.createHmac('sha256', salt()).update(`${checkId}:${code}`).digest('hex')

export const normaliseEmail = (input: string): string | null => {
    const e = (input || '').trim().toLowerCase()
    return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) && e.length <= 254 ? e : null
}
export const isDisposableEmail = (email: string) => DISPOSABLE.has(email.split('@')[1] || '')
export const countryFromTz = (tz: string) => (/^Asia\/(Kolkata|Calcutta)$/.test(tz || '') ? 'IN' : (tz || '').slice(0, 64))

const answersOf = (check: IFreeCheck) => check.questions.flatMap((q) => q.answers)

// Before the email is verified: counts only, never other brands' names
export const halfResult = (check: IFreeCheck) => {
    const ok = answersOf(check).filter((a) => a.ok)
    const engines = ['ChatGPT', 'Gemini'] as const
    return {
        status: check.status,
        brandName: check.brandName,
        questions: check.questions.map((q) => ({
            text: q.text,
            engines: q.answers.map(({ engine, ok: answered, named, position }) => ({ engine, ok: answered, named, position }))
        })),
        namedCount: ok.filter((a) => a.named).length,
        total: ok.length,
        otherBrandsCount: new Set(ok.flatMap((a) => a.brands.map(brandKey))).size,
        failedEngines: check.status === 'done' ? engines.filter((e) => !answersOf(check).some((a) => a.engine === e && a.ok)) : []
    }
}

export const fullResult = (check: IFreeCheck) => {
    const counts = new Map<string, { name: string; count: number }>()
    for (const a of answersOf(check).filter((x) => x.ok)) {
        for (const name of a.brands) {
            const k = brandKey(name)
            const row = counts.get(k) ?? { name, count: 0 }
            row.count++
            counts.set(k, row)
        }
    }
    return { ...halfResult(check), otherBrands: [...counts.values()].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)) }
}
