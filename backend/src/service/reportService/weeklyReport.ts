// backend/src/service/reportService/weeklyReport.ts
// Monday 9:00 AM IST: every brand on a paid plan gets a report emailed to its owner and the addresses
// shared on the Reports page, with the PDF attached and a personal unsubscribe link.
import crypto from 'crypto'
import config from '../../config/config'
import brandModel from '../../model/brandModel'
import orgModel from '../../model/orgModel'
import userModel from '../../model/userModel'
import reportModel from '../../model/reportModel'
import reportShareModel from '../../model/reportShareModel'
import mentionModel from '../../model/mentionModel'
import emailService from '../emailService'
import logger from '../../util/loger'
import { generateReportPdf } from './pdfService'
import { IReportData } from './reportData'
import fixEventModel from '../../model/fixEventModel'
import { fixResultLine, getFixImpact, pickEmailGroup, type IFixGroup } from '../fixImpactService'
import type { PlanName } from '../../config/planLimits'

export const WEEKLY_REPORT_PLANS = ['starter', 'growth', 'agency']

// ---- Unsubscribe links -------------------------------------------------------------------------

const unsubscribeKey = () =>
    crypto
        .createHash('sha256')
        .update(`weekly-report-unsubscribe:${config.ACCESS_TOKEN.SECRET || 'dev'}`)
        .digest()

export const unsubscribeToken = (brandId: string, email: string) =>
    crypto.createHmac('sha256', unsubscribeKey()).update(`${brandId}:${email.toLowerCase()}`).digest('base64url')

export const verifyUnsubscribeToken = (brandId: string, email: string, token: string) => {
    const expected = Buffer.from(unsubscribeToken(brandId, email))
    const given = Buffer.from(String(token))
    return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}

const apiBase = () => (config.SERVER_URL || `http://localhost:${config.PORT || 8080}`).replace(/\/$/, '')

export const unsubscribeUrl = (brandId: string, email: string) =>
    `${apiBase()}/api/v1/reports/unsubscribe?b=${brandId}&e=${encodeURIComponent(email.toLowerCase())}&t=${unsubscribeToken(brandId, email)}`

// ---- Email content -----------------------------------------------------------------------------

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const deltaLine = (d: IReportData) => {
    if (d.previousVisibility === null) return 'Your first weekly report'
    const delta = d.visibility - d.previousVisibility
    if (delta === 0) return 'No change since last scan'
    return `${delta > 0 ? 'Up' : 'Down'} ${Math.abs(delta)} points since last scan`
}

// fixLine: a fix impact result (feature #14), only when one became final this week
export const renderWeeklyEmail = (d: IReportData, unsubscribe: string, fixLine?: string) => {
    const dashboard = `${config.FRONTEND_URL.replace(/\/$/, '')}/`
    const subject = `${d.brandName}: ${d.visibility}% AI visibility this week`
    const recs = d.recommendations.slice(0, 3)

    const text = [
        `${d.brandName} weekly AI visibility report`,
        '',
        `Visibility: ${d.visibility}% (${deltaLine(d)})`,
        ...d.engines.map((e) => `- ${e.name}: ${e.score}% (named in ${e.mentioned} of ${e.total} answers)`),
        ...(fixLine ? ['', fixLine] : []),
        '',
        recs.length ? 'What to do next:' : '',
        ...recs.map((r, i) => `${i + 1}. ${r.text}`),
        '',
        `The full report is attached as a PDF. Open your dashboard: ${dashboard}`,
        '',
        `Stop these emails: ${unsubscribe}`
    ].join('\n')

    const row = (label: string, value: string) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #E4E9E7;color:#0F2629">${label}</td><td style="padding:8px 0;border-bottom:1px solid #E4E9E7;text-align:right;color:#0F2629"><b>${value}</b></td></tr>`

    const html = `<!doctype html><html><body style="margin:0;background:#F2F4F1;font-family:Arial,Helvetica,sans-serif;color:#0F2629">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F1;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #D3DBD8;border-radius:12px;padding:28px">
  <tr><td style="font-size:13px;font-weight:bold;padding-bottom:18px">Signal AI</td></tr>
  <tr><td style="font-size:22px;font-weight:bold;line-height:1.2">${esc(d.brandName)}</td></tr>
  <tr><td style="font-size:14px;color:#52676A;padding-bottom:18px">Weekly AI visibility report</td></tr>
  <tr><td style="font-size:44px;font-weight:bold;line-height:1">${d.visibility}%</td></tr>
  <tr><td style="font-size:14px;color:#52676A;padding:6px 0 20px">of AI answers named you. ${esc(deltaLine(d))}.</td></tr>
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
    ${d.engines.map((e) => row(esc(e.name), `${e.score}%`)).join('')}
  </table></td></tr>
  ${fixLine ? `<tr><td style="font-size:14px;font-weight:bold;color:#1E7A4C;padding:16px 0 0">${esc(fixLine)}</td></tr>` : ''}
  ${
      recs.length
          ? `<tr><td style="font-size:15px;font-weight:bold;padding:22px 0 8px">What to do next</td></tr>
  <tr><td style="font-size:14px;line-height:1.5"><ol style="margin:0;padding-left:20px">${recs.map((r) => `<li style="margin-bottom:6px">${esc(r.text)}</li>`).join('')}</ol></td></tr>`
          : ''
  }
  <tr><td style="padding:24px 0 8px"><a href="${esc(dashboard)}" style="display:inline-block;background:#FFC857;color:#0F2629;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Open your dashboard</a></td></tr>
  <tr><td style="font-size:13px;color:#52676A">The full report, question by question, is attached as a PDF.</td></tr>
</table>
<p style="font-size:12px;color:#52676A;max-width:560px;margin:16px auto 0">You get this email every Monday because it was turned on for ${esc(d.brandName)} on Signal AI. <a href="${esc(unsubscribe)}" style="color:#52676A">Unsubscribe</a> or change it any time in Settings.</p>
</td></tr></table></body></html>`

    return { subject, text, html }
}

// ---- Sending -----------------------------------------------------------------------------------

const weekOfLabel = (date = new Date()) =>
    `Week of ${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}`

export const sendWeeklyReport = async (brandId: string): Promise<{ sent: number; skipped?: string }> => {
    const brand = await brandModel.findById(brandId).lean()
    if (!brand) return { sent: 0, skipped: 'brand deleted' }

    const org = await orgModel.findById(brand.orgId).lean()
    if (!org || !WEEKLY_REPORT_PLANS.includes(org.plan || 'free')) return { sent: 0, skipped: 'not on a paid plan' }

    if (!(await mentionModel.exists({ brandId }))) return { sent: 0, skipped: 'no scans yet' }

    // Idempotent per week: a retried or duplicated job never emails twice
    const weekOf = weekOfLabel()
    const alreadySent = await reportModel.exists({ brandId, type: 'weekly', date: weekOf, emailedAt: { $ne: null } })
    if (alreadySent) return { sent: 0, skipped: 'already sent this week' }

    // The owner gets it only after opting in (signup or Settings); shared addresses until they unsubscribe
    const owner = await userModel.findById(org.ownerId).select('email weeklyReportEmails').lean()
    const share = await reportShareModel.findOne({ brandId }).lean()
    const unsubscribed = new Set((share?.unsubscribed || []).map((e) => e.toLowerCase()))
    const recipients = [
        ...new Set(
            [owner?.weeklyReportEmails ? owner.email : null, ...(share?.sharedEmails || [])].filter(Boolean).map((e) => String(e).toLowerCase())
        )
    ].filter((e) => !unsubscribed.has(e))
    if (recipients.length === 0) return { sent: 0, skipped: 'no recipients opted in' }

    const databseService = (await import('../databseService')).default
    const report =
        (await reportModel.findOne({ brandId, type: 'weekly', date: weekOf, emailedAt: null })) ||
        (await databseService.generateBrandReport(brandId, 'weekly'))
    const data = report.data as IReportData

    // A final, positive fix impact result not emailed yet; never blocks the report
    let fixGroup: IFixGroup | null = null
    try {
        fixGroup = pickEmailGroup(await getFixImpact(brandId, (org.plan || 'free') as PlanName))
    } catch (err) {
        logger.error(`[WeeklyReport] Fix impact for brand ${brandId} failed`, { meta: err })
    }
    const fixLine = fixGroup ? fixResultLine(fixGroup) : undefined

    const pdf = await generateReportPdf(data)
    const safeName = brand.name.replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '') || 'Brand'

    let sent = 0
    for (const to of recipients) {
        const unsubscribe = unsubscribeUrl(brandId, to)
        const { subject, text, html } = renderWeeklyEmail(data, unsubscribe, fixLine)
        try {
            await emailService.sendEmail([to], subject, text, {
                html,
                attachments: [{ filename: `Signal_AI_${safeName}_${weekOf.replace(/\s+/g, '_')}.pdf`, content: pdf }],
                headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
            })
            sent++
        } catch (err) {
            logger.error(`[WeeklyReport] Email to ${to} for brand ${brandId} failed`, { meta: err })
        }
    }

    if (sent === 0) throw new Error(`Weekly report for brand ${brandId}: no email could be sent`)
    report.emailedAt = new Date()
    await report.save()
    if (fixGroup) await fixEventModel.updateMany({ _id: { $in: fixGroup.eventIds } }, { emailedAt: new Date() })
    logger.info(`[WeeklyReport] Sent report for brand ${brandId} to ${sent}/${recipients.length} recipient(s)`)
    return { sent }
}
