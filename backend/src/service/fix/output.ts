import type { IGeneratedFix, IFixItem } from '../../types/fixTypes'

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const pending = (s?: string) => !!s && s.includes('[confirm')

const rowsText = (it: IFixItem) => (it.rows ?? []).map((r) => `${r.label}: ${r.brand} | ${r.competitor}`).join('\n')
const rowsHtml = (it: IFixItem) =>
    `<table>${(it.rows ?? []).map((r) => `<tr><th>${esc(r.label)}</th><td>${esc(r.brand)}</td><td>${esc(r.competitor)}</td></tr>`).join('')}</table>`

// Ready-to-paste forms of a saved fix; the FAQ schema skips answers the owner still has to confirm
export const fixOutputs = (fix: Pick<IGeneratedFix, 'type' | 'title' | 'items'>) => {
    const title = fix.title || ''
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
