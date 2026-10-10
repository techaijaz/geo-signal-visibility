import { unsubscribeToken, verifyUnsubscribeToken } from '../reportService/weeklyReport'
import config from '../../config/config'
import { fullResult } from './helpers'
import type { IFreeCheck } from '../../types/freeCheckTypes'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const appUrl = () => (config.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')
const apiUrl = () => (config.SERVER_URL || `http://localhost:${config.PORT || 8080}`).replace(/\/$/, '')

// Same HMAC as the weekly report, under a fixed "lead" scope
export const leadUnsubscribeUrl = (email: string) =>
    `${apiUrl()}/api/v1/public/leads/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubscribeToken('lead', email)}`
export const verifyLeadUnsubscribe = (email: string, token: string) => verifyUnsubscribeToken('lead', email, token)

export const otpEmail = (code: string) => ({
    subject: `Your Signal check code: ${code}`,
    text: `Your code is ${code}. It works for 10 minutes.\n\nIf you didn't ask for an AI visibility check at geosignalai.com, ignore this email.`,
    html: `<p>Your code is <b style="font-size:20px;letter-spacing:3px">${code}</b>. It works for 10 minutes.</p><p style="color:#666">If you didn't ask for an AI visibility check at geosignalai.com, ignore this email.</p>`
})

export const reportEmail = (check: IFreeCheck, email: string, consent: boolean) => {
    const r = fullResult(check)
    const signup = `${appUrl()}/signup?fc=${encodeURIComponent(check.checkId)}`
    const rows = check.questions
        .map((q) => {
            const cells = q.answers
                .map((a) => `${a.engine}: ${!a.ok ? 'no answer' : a.named ? `named${a.position ? ` (#${a.position})` : ''}` : 'not named'}`)
                .join(' · ')
            const others = [...new Set(q.answers.flatMap((a) => a.brands))]
            return `<tr><td style="padding:8px 0"><b>${esc(q.text)}</b><br/>${esc(cells)}${others.length ? `<br/>Named instead: ${esc(others.join(', '))}` : ''}</td></tr>`
        })
        .join('')
    const top = r.otherBrands
        .slice(0, 5)
        .map((b) => `${b.name} (${b.count}/${r.total})`)
        .join(', ')
    const footer = consent
        ? `<p style="color:#888;font-size:12px">You asked for this report at geosignalai.com. <a href="${leadUnsubscribeUrl(email)}">Stop tips and updates (unsubscribe)</a></p>`
        : `<p style="color:#888;font-size:12px">You asked for this report at geosignalai.com.</p>`
    const subject = `${check.brandName} on ChatGPT and Gemini: named in ${r.namedCount} of ${r.total} answers`
    const html = `<h2>${esc(subject)}</h2>${top ? `<p>AI recommends instead: <b>${esc(top)}</b></p>` : ''}<table>${rows}</table>
<p>AI recommends brands it has read about in many places: reviews, lists and comparison pages.</p>
<p><a href="${signup}" style="background:#0F2629;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Create a free account</a> and track 15 questions across 5 AIs every week.</p>${footer}`
    const text = `${subject}\n\n${check.questions.map((q) => `- ${q.text}`).join('\n')}\n\nAI recommends instead: ${top || '—'}\n\nCreate a free account: ${signup}`
    return { subject, text, html }
}
