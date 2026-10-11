import type { IPageText } from './readPages'
import type { FixLanguage, FixType, IFixItem } from '../../types/fixTypes'

const LANGUAGE: Record<FixLanguage, string> = {
    en: 'English',
    'hi-en': 'Hinglish (Hindi in Latin script, the way Indian shoppers type)',
    hi: 'Hindi in Devanagari script'
}

const pageBlock = (p: IPageText) =>
    `URL: ${p.url}\nTitle: ${p.title}${p.price ? `\nPrice: ${p.price}` : ''}${p.rating ? `\nRating: ${p.rating}` : ''}\nText: ${p.text}`

export const buildFixPrompt = (input: {
    type: FixType
    brandName: string
    competitor?: string | null
    kind?: string | null
    language: FixLanguage
    questions: string[]
    pages: IPageText[]
    competitorPages?: IPageText[]
    aiSaid?: string[]
}) => {
    const rules = [
        `Use ONLY the page text below. Never invent facts, prices, ingredients, delivery times or claims.`,
        `If a fact a shopper would want is not in the text, write it as [confirm: <what the owner must check>].`,
        `Every item has "source": one URL copied exactly from the pages below that supports it. If none supports it, leave "source" empty and use [confirm: ...].`,
        `Write in ${LANGUAGE[input.language]}. Keep brand and product names as they are.`,
        `Reply with JSON only, no other text.`
    ]
    const own = input.pages.map(pageBlock).join('\n\n---\n\n')
    if (input.type === 'faq') {
        return `You write FAQ content for ${input.brandName}'s website${input.kind ? ` about its ${input.kind} products` : ''}.
Rules:
- ${rules.join('\n- ')}
- Write 8 to 12 questions shoppers really ask. Prefer these buyer questions where the pages can answer them: ${input.questions.slice(0, 15).join(' | ') || 'none given'}.
- Answers 1 to 3 sentences.

JSON shape: {"title": string, "items": [{"question": string, "answer": string, "source": string}]}

PAGES:
${own}`
    }
    const theirs = (input.competitorPages ?? []).map(pageBlock).join('\n\n---\n\n')
    return `You write a fair comparison page "${input.brandName} vs ${input.competitor}" for ${input.brandName}'s website.
Rules:
- ${rules.join('\n- ')}
- Facts about ${input.competitor} only from ITS pages or the AI answers below. Never say anything negative about ${input.competitor}; describe differences neutrally.
- Sections: a short intro, a difference table, "When to choose ${input.brandName}", and 3 to 5 FAQ items as sections.

JSON shape: {"title": string, "items": [{"heading": string, "body": string, "source": string} | {"heading": "Differences", "rows": [{"label": string, "brand": string, "competitor": string}]}]}

${input.brandName.toUpperCase()} PAGES:
${own}

${String(input.competitor).toUpperCase()} PAGES:
${theirs || 'none could be read'}

WHAT AI ASSISTANTS SAID ABOUT ${String(input.competitor).toUpperCase()}:
${(input.aiSaid ?? []).slice(0, 5).join('\n') || 'nothing stored'}`
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const jsonIn = (raw: string): unknown => {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]
    const body = fenced ?? raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
    try {
        return JSON.parse(body)
    } catch {
        return null
    }
}

// The AI's JSON as items we can save; a source not among the pages read becomes a [confirm] mark
export const parseFixResponse = (raw: string, type: FixType, allowedUrls: string[]): { title: string; items: IFixItem[] } | null => {
    const data = jsonIn(raw) as { title?: unknown; items?: unknown } | null
    if (!data || !Array.isArray(data.items)) return null
    const allowed = new Set(allowedUrls)
    const items: IFixItem[] = []
    for (const it of data.items as Array<Record<string, unknown>>) {
        const source = str(it?.source)
        const ok = !source || allowed.has(source)
        const mark = (text: string) => (ok || text.startsWith('[confirm') ? text : `[confirm: source not found] ${text}`)
        if (type === 'faq') {
            const question = str(it?.question)
            const answer = str(it?.answer)
            if (!question || !answer) continue
            items.push({ question, answer: mark(answer), ...(ok && source ? { source } : {}) })
        } else if (Array.isArray(it?.rows)) {
            const rows = (it.rows as Array<Record<string, unknown>>)
                .map((r) => ({ label: str(r?.label), brand: str(r?.brand), competitor: str(r?.competitor) }))
                .filter((r) => r.label)
            if (rows.length) items.push({ heading: str(it.heading) || 'Differences', rows })
        } else {
            const heading = str(it?.heading)
            const body = str(it?.body)
            if (!heading || !body) continue
            items.push({ heading, body: mark(body), ...(ok && source ? { source } : {}) })
        }
    }
    return items.length ? { title: str(data.title) || (type === 'faq' ? 'FAQ' : 'Comparison'), items } : null
}
