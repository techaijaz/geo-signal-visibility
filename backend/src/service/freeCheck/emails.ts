import { unsubscribeToken, verifyUnsubscribeToken } from '../reportService/weeklyReport'
import config from '../../config/config'
import { fullResult } from './helpers'
import type { IFreeCheck, IFreeCheckAnswer } from '../../types/freeCheckTypes'
import { layout } from '../emailTemplates'

const esc = (v: unknown) =>
    String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
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

const TOP = 8
const answerLabel = (a: IFreeCheckAnswer) => (!a.ok ? 'no answer' : a.named ? `named${a.position ? ` #${a.position}` : ''}` : 'not named')
const answerColor = (a: IFreeCheckAnswer) => (!a.ok ? '#52676A' : a.named ? '#1E7A46' : '#B3261E')
const label = (t: string) =>
    `<tr><td style="padding:26px 0 8px;font-size:13px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;color:#52676A">${t}</td></tr>`

// Report body in the account-email layout: big number, who instead, a card per question
export const reportEmail = (check: IFreeCheck, email: string, consent: boolean) => {
    const r = fullResult(check)
    const signup = `${appUrl()}/signup?fc=${encodeURIComponent(check.checkId)}`
    const top = r.otherBrands.slice(0, TOP)
    const more = r.otherBrands.length - top.length

    const stat = `<tr><td style="padding-top:20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF4D6;border-radius:12px"><tr>
    <td style="padding:18px 20px;font-size:30px;font-weight:bold;color:#0F2629;white-space:nowrap;width:1%">${r.namedCount} of ${r.total}</td>
    <td style="padding:18px 20px 18px 0;font-size:15px;line-height:1.4;color:#33484B">AI answers named ${esc(check.brandName)}</td>
  </tr></table></td></tr>`

    const instead = top.length
        ? label('Recommended instead of you') +
          top
              .map(
                  (
                      b
                  ) => `<tr><td style="padding:6px 0;border-bottom:1px solid #EEF1F0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font-size:15px;color:#0F2629"><b>${esc(b.name)}</b></td>
    <td align="right" style="font-size:14px;color:#52676A;white-space:nowrap">${b.count} of ${r.total}</td>
  </tr></table></td></tr>`
              )
              .join('') +
          (more > 0 ? `<tr><td style="padding-top:8px;font-size:13px;color:#52676A">and ${more} more</td></tr>` : '')
        : ''

    const cards =
        label(`Your ${check.questions.length} questions`) +
        check.questions
            .map((q) => {
                const others = [...new Set(q.answers.flatMap((a) => a.brands))]
                const lines = q.answers
                    .map(
                        (a) =>
                            `<tr><td style="padding:3px 0;font-size:14px;color:#33484B;width:80px">${esc(a.engine)}</td><td style="padding:3px 0;font-size:14px;font-weight:bold;color:${answerColor(a)}">${answerLabel(a)}</td></tr>`
                    )
                    .join('')
                return `<tr><td style="padding:6px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E4E9E7;border-radius:10px"><tr><td style="padding:14px 16px">
    <div style="font-size:15px;font-weight:bold;color:#0F2629;padding-bottom:6px">${esc(q.text)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0">${lines}</table>
    ${others.length ? `<div style="padding-top:8px;font-size:13px;line-height:1.5;color:#52676A">Named instead: ${esc(others.join(', '))}</div>` : ''}
  </td></tr></table></td></tr>`
            })
            .join('') +
        `<tr><td style="padding-top:18px;font-size:14px;line-height:1.6;color:#33484B">AI recommends brands it has read about in many places: reviews, lists and comparison pages.</td></tr>`

    const subject = `${check.brandName} on ChatGPT and Gemini: named in ${r.namedCount} of ${r.total} answers`
    const html = layout({
        preheader: top.length
            ? `AI recommends ${top
                  .slice(0, 3)
                  .map((b) => b.name)
                  .join(', ')} instead of you.`
            : 'Your free AI visibility check.',
        title: `${check.brandName} on ChatGPT and Gemini`,
        intro: `Here is how AI answered the 3 buyer questions you picked for <b>${esc(check.domain)}</b>.`,
        extraHtml: stat + instead + cards,
        button: { label: 'Create a free account', url: signup },
        stepsTitle: 'What you get (free)',
        steps: [
            { title: '3 questions tracked every week', body: 'The questions your buyers ask, checked again so you see what changes.' },
            { title: 'ChatGPT, Gemini and Claude', body: 'Which brands each AI names, and where you stand.' },
            { title: 'The fixes that get you named', body: 'What to change on your site and where to be mentioned.' }
        ],
        note: consent
            ? `You asked for this report at geosignalai.com. <a href="${leadUnsubscribeUrl(email)}" style="color:#52676A">Stop tips and updates (unsubscribe)</a>`
            : 'You asked for this report at geosignalai.com.'
    })

    const text = [
        subject,
        '',
        `${r.namedCount} of ${r.total} AI answers named ${check.brandName}.`,
        '',
        ...(top.length
            ? ['Recommended instead of you:', ...top.map((b) => `${b.name}: ${b.count} of ${r.total}`), ...(more > 0 ? [`and ${more} more`] : []), '']
            : []),
        'Your questions:',
        ...check.questions.map((q) => `- ${q.text}\n  ${q.answers.map((a) => `${a.engine}: ${answerLabel(a)}`).join(' · ')}`),
        '',
        `Create a free account: ${signup}`,
        '',
        'You asked for this report at geosignalai.com.',
        ...(consent ? [`Stop tips and updates: ${leadUnsubscribeUrl(email)}`] : [])
    ].join('\n')
    return { subject, text, html }
}
