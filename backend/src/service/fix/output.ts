import type { IGeneratedFix, IFixItem } from '../../types/fixTypes'

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const pending = (s?: string) => !!s && s.includes('[confirm')

const rowsText = (it: IFixItem) => (it.rows ?? []).map((r) => `${r.label}: ${r.brand} | ${r.competitor}`).join('\n')
const rowsHtml = (it: IFixItem) =>
    `<table>${(it.rows ?? []).map((r) => `<tr><th>${esc(r.label)}</th><td>${esc(r.brand)}</td><td>${esc(r.competitor)}</td></tr>`).join('')}</table>`

// The fix guide for publishing each type, and what to call it
export const FIX_GUIDE = {
    faq: { kind: 'faq-page', what: 'FAQ page' },
    comparison: { kind: 'comparison-page', what: 'comparison page' },
    llms: { kind: 'llms-txt', what: 'llms.txt file' }
} as const

// Text from the model or the owner on one line, so it can't add its own headings or links to the file
const oneLine = (s?: string) => (s || '').replace(/\s+/g, ' ').trim()
export const isLlmsSummary = (i: IFixItem) => /^summary$/i.test(oneLine(i.heading))
const linkUrl = (src?: string) => {
    if (!/^https?:\/\//i.test(src || '')) return ''
    let url = src!.trim()
    try {
        url = encodeURI(decodeURI(url))
    } catch {
        url = encodeURI(url)
    }
    return url.replace(/\(/g, '%28').replace(/\)/g, '%29')
}

// The llms.txt file (llmstxt.org): title, summary as a quote, then a section of links per heading, in first-seen order
const llmsText = (title: string, items: IFixItem[]) => {
    const [first, ...more] = items
        .filter(isLlmsSummary)
        .map((i) => oneLine(i.body))
        .filter(Boolean)
    const sections = new Map<string, string[]>()
    for (const i of items.filter((i) => !isLlmsSummary(i))) {
        const url = linkUrl(i.source)
        if (!url) continue
        // A link whose name was cleared still links, by its address
        const label = (oneLine(i.label) || oneLine(i.source)).replace(/[[\]]/g, '')
        const heading = oneLine(i.heading).replace(/^[#>\-\s]+/, '') || 'Pages'
        const body = oneLine(i.body)
        sections.set(heading, [...(sections.get(heading) ?? []), `- [${label}](${url})${body ? `: ${body}` : ''}`])
    }
    const blocks = [
        `# ${oneLine(title)}`,
        ...(first ? [`> ${first}`] : []),
        ...more,
        ...[...sections].map(([h, links]) => `## ${h}\n\n${links.join('\n')}`)
    ]
    return `${blocks.join('\n\n')}\n`
}

// Ready-to-paste forms of a saved fix; the FAQ schema skips answers the owner still has to confirm
export const fixOutputs = (fix: Pick<IGeneratedFix, 'type' | 'title' | 'items'>) => {
    const title = fix.title || ''
    if (fix.type === 'llms') {
        const text = llmsText(title, fix.items)
        return { text, html: `<pre>${esc(text)}</pre>`, jsonLd: null }
    }
    if (fix.type === 'faq') {
        const text = [title, ...fix.items.map((i) => `Q: ${i.question}\nA: ${i.answer}`)].join('\n\n')
        const html = [`<h2>${esc(title)}</h2>`, ...fix.items.map((i) => `<h3>${esc(i.question)}</h3>\n<p>${esc(i.answer)}</p>`)].join('\n')
        const ready = fix.items.filter((i) => !pending(i.answer))
        const jsonLd = ready.length
            ? `<script type="application/ld+json">${JSON.stringify({
                  '@context': 'https://schema.org',
                  '@type': 'FAQPage',
                  mainEntity: ready.map((i) => ({ '@type': 'Question', name: i.question, acceptedAnswer: { '@type': 'Answer', text: i.answer } }))
              }).replace(/</g, '\\u003c')}</script>`
            : null
        return { text, html, jsonLd }
    }
    const text = [title, ...fix.items.map((i) => `${i.heading}\n${i.rows?.length ? rowsText(i) : i.body}`)].join('\n\n')
    const html = [
        `<h2>${esc(title)}</h2>`,
        ...fix.items.map((i) => `<h3>${esc(i.heading)}</h3>\n${i.rows?.length ? rowsHtml(i) : `<p>${esc(i.body)}</p>`}`)
    ].join('\n')
    return { text, html, jsonLd: null }
}
