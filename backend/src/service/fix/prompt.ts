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
    sellsProducts?: boolean
}) => {
    // An llms.txt is read by AI crawlers, so it is always English
    const language = input.type === 'llms' ? 'en' : input.language
    const rules = [
        `Use ONLY the page text below. Never invent facts, prices, ingredients, delivery times or claims.`,
        `If a fact a shopper would want is not in the text, write it as [confirm: <what the owner must check>].`,
        `Every item has "source": one URL copied exactly from the pages below that supports it. If none supports it, leave "source" empty and use [confirm: ...].`,
        `Write in ${LANGUAGE[language]}. Keep brand and product names as they are.`,
        `Reply with JSON only, no other text.`
    ]
    const own = input.pages.map(pageBlock).join('\n\n---\n\n')
    if (input.type === 'llms') {
        const offers = input.sellsProducts === false ? 'Services' : 'Products'
        return `You write the llms.txt file (llmstxt.org) for ${input.brandName}'s website: a short guide that tells AI assistants who the brand is and which pages to read.
Rules:
- ${rules.join('\n- ')}
- First item: {"heading": "Summary", "body": one or two plain sentences on who ${input.brandName} is, what it offers and where, "source": the page that says so}.
- Then one item per page worth linking, in these sections only: "${offers}", "About", "Policies", "Contact". Skip a section with no page.
- "label" is the page's short name; "body" is one line on what the page covers (may be empty). "source" is that page's URL, copied exactly.
- Link each page once. Never link a page that is not below.

JSON shape: {"title": string, "items": [{"heading": string, "label": string, "body": string, "source": string}]}

PAGES:
${own}`
    }
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

JSON shape: {"title": string, "items": [{"heading": string, "body": string, "source": string} | {"heading": "Differences", "rows": [{"label": string, "brand": string, "competitor": string, "source": string}]}]}

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
    const confirmed = (text: string) => text.startsWith('[confirm')
    for (const it of data.items as Array<Record<string, unknown>>) {
        const source = str(it?.source)
        const ok = allowed.has(source)
        // Text without a source we read is something the owner must check before it goes live
        const mark = (text: string) => (ok || confirmed(text) ? text : `${source ? '[confirm: source not found]' : '[confirm: no source]'} ${text}`)
        if (type === 'llms') {
            const heading = str(it?.heading)
            const body = str(it?.body)
            if (/^summary$/i.test(heading)) {
                if (body) items.push({ heading: 'Summary', body: mark(body), ...(ok && source ? { source } : {}) })
                continue
            }
            // A wrong link is worse than none: links only to pages we read, never marked and kept
            const label = str(it?.label)
            if (!heading || !label || !ok) continue
            items.push({ heading, label, body: body && mark(body), source })
        } else if (type === 'faq') {
            const question = str(it?.question)
            const answer = str(it?.answer)
            if (!question || !answer) continue
            items.push({ question, answer: mark(answer), ...(ok && source ? { source } : {}) })
        } else if (Array.isArray(it?.rows)) {
            // Each row needs its own source; values in an unsourced row are marked, never passed as fact
            const cell = (text: string, sourced: boolean) => (sourced || !text || confirmed(text) ? text : `[confirm] ${text}`)
            const rows = (it.rows as Array<Record<string, unknown>>)
                .map((r) => {
                    const sourced = allowed.has(str(r?.source))
                    return { label: str(r?.label), brand: cell(str(r?.brand), sourced), competitor: cell(str(r?.competitor), sourced) }
                })
                .filter((r) => r.label)
            if (rows.length) items.push({ heading: str(it.heading) || 'Differences', rows })
        } else {
            const heading = str(it?.heading)
            const body = str(it?.body)
            if (!heading || !body) continue
            items.push({ heading, body: mark(body), ...(ok && source ? { source } : {}) })
        }
    }
    // An llms.txt with no page links is just a summary, not worth a generation
    if (type === 'llms' && !items.some((i) => i.label)) return null
    return items.length ? { title: str(data.title) || (type === 'faq' ? 'FAQ' : type === 'llms' ? 'llms.txt' : 'Comparison'), items } : null
}
