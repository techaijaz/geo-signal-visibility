import mongoose from 'mongoose'
import brandModel from '../model/brandModel'
import recommendationModel from '../model/recommendationModel'
import generatedFixModel from '../model/generatedFixModel'
import developerSendModel from '../model/developerSendModel'
import emailService from './emailService'
import { layout } from './emailTemplates'
import { fixOutputs } from './fix/output'
import { guideFor, guideContext, kindForCheck, type FixKind } from './fixGuide'
import { withKind } from './recommendationService'
import { isDisposableEmail } from './freeCheck/helpers'
import type { IGeneratedFix } from '../types/fixTypes'

export const DEV_SENDS_PER_DAY = 20
export type DeveloperTaskRef =
    | { type: 'recommendation'; id: string }
    | { type: 'store-audit' | 'collection' | 'ai-view' | 'feed'; key: string; url?: string }
    | { type: 'fix'; id: string }
export const taskKey = (t: DeveloperTaskRef) => ('id' in t ? `${t.type}:${t.id}` : `${t.type}:${t.key}:${t.url || ''}`)

const httpErr = (status: number, message: string) => Object.assign(new Error(message), { status })
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const SURFACE_LABEL = {
    'store-audit': 'Product page check',
    collection: 'Collection page check',
    'ai-view': 'AI crawler view',
    feed: 'Product feed check'
} as const

interface IResolved {
    kind: FixKind
    what: string
    url: string
    code: string
}

// The task, from what we saved; nothing from the request is put in the email
const resolveTask = async (brandId: string, t: DeveloperTaskRef): Promise<IResolved> => {
    if (t.type === 'recommendation') {
        if (!mongoose.isValidObjectId(t.id)) throw httpErr(404, 'Task not found')
        const rec = await recommendationModel.findOne({ _id: t.id, brandId }).lean()
        if (!rec) throw httpErr(404, 'Task not found')
        const r = withKind(rec as { text: string; kind?: string | null; snippet?: string; reasoning?: string })
        return { kind: r.kind, what: [r.text, r.reasoning].filter(Boolean).join('\n\n'), url: '', code: r.snippet || '' }
    }
    if (t.type === 'fix') {
        if (!mongoose.isValidObjectId(t.id)) throw httpErr(404, 'Task not found')
        const fix = await generatedFixModel.findOne({ _id: t.id, brandId, status: 'done' }).lean()
        if (!fix) throw httpErr(404, 'Task not found')
        const out = fixOutputs(fix as unknown as IGeneratedFix)
        const kind: FixKind = fix.type === 'faq' ? 'faq-page' : 'comparison-page'
        return {
            kind,
            what: `Publish this ${fix.type === 'faq' ? 'FAQ' : 'comparison'} page: ${fix.title || ''}`.trim(),
            url: '',
            code: [out.html, out.jsonLd].filter(Boolean).join('\n\n')
        }
    }
    const kind = kindForCheck(t.type, t.key)
    const url = t.url && /^https?:\/\//i.test(t.url) ? t.url.slice(0, 500) : ''
    return { kind, what: `${SURFACE_LABEL[t.type]}: ${guideFor(kind).title.toLowerCase()}.`, url, code: '' }
}

export const buildDeveloperEmail = (brandName: string, founderName: string, task: IResolved, isShopify: boolean) => {
    const guide = guideFor(task.kind)
    const steps = isShopify ? guide.steps.shopify : guide.steps.other
    const subject = `${brandName}: ${guide.title}`
    const footer = `Sent by ${founderName} from Signal AI. Reply to this email to reach them.`
    const text = [
        task.what,
        task.url && `Page: ${task.url}`,
        '',
        'Steps:',
        ...steps.map((s, i) => `${i + 1}. ${s}`),
        '',
        `For the developer: ${guide.forDeveloper}`,
        task.code && `\nCode:\n${task.code}`,
        '',
        footer
    ]
        // falsy optional lines (no url, no code) drop out; '' stays as a blank line
        .filter((l): l is string => typeof l === 'string')
        .join('\n')
    const extraHtml = [
        task.url
            ? `<tr><td style="padding-top:10px;font-size:14px"><a href="${esc(task.url)}" style="color:#1F6F78">${esc(task.url)}</a></td></tr>`
            : '',
        `<tr><td style="padding-top:16px;font-size:14px;line-height:1.6;color:#33484B"><b>For the developer:</b> ${esc(guide.forDeveloper)}</td></tr>`,
        task.code
            ? `<tr><td style="padding-top:12px"><pre style="white-space:pre-wrap;word-break:break-word;background:#F2F4F1;border-radius:8px;padding:12px;font-size:12px">${esc(task.code)}</pre></td></tr>`
            : ''
    ].join('')
    const html = layout({
        preheader: guide.title,
        title: guide.title,
        intro: esc(task.what).replace(/\n/g, '<br/>'),
        extraHtml,
        stepsTitle: 'Steps',
        steps: steps.map((s, i) => ({ title: `Step ${i + 1}`, body: s })),
        note: esc(footer)
    })
    return { subject, text, html }
}

type Mailer = (m: { to: string[]; subject: string; text: string; html: string; cc?: string[]; replyTo?: string }) => Promise<unknown>
const defaultMailer: Mailer = (m) => emailService.sendEmail(m.to, m.subject, m.text, { html: m.html, cc: m.cc, replyTo: m.replyTo })

const consumeSend = async (brandId: string) => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const same = await brandModel.updateOne(
        { _id: brandId, devSendDay: today, devSendCount: { $lt: DEV_SENDS_PER_DAY } },
        { $inc: { devSendCount: 1 } }
    )
    if (same.modifiedCount === 1) return true
    const fresh = await brandModel.updateOne({ _id: brandId, devSendDay: { $ne: today } }, { $set: { devSendDay: today, devSendCount: 1 } })
    return fresh.modifiedCount === 1
}

export const sendToDeveloper = async (
    brand: { _id: unknown; name: string; developerEmail?: string | null; products?: Array<{ shopifyId?: string | null }> },
    founder: { name: string; email: string; _id?: unknown },
    task: DeveloperTaskRef,
    email?: string,
    mailer: Mailer = defaultMailer
) => {
    const brandId = String(brand._id)
    let to = (brand.developerEmail || '').trim().toLowerCase()
    if (email !== undefined) {
        const e = email.trim().toLowerCase()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw httpErr(422, "Enter your developer's email, like dev@agency.in")
        if (isDisposableEmail(e)) throw httpErr(422, 'Use a real email address for your developer.')
        to = e
        await brandModel.updateOne({ _id: brandId }, { $set: { developerEmail: e } })
    }
    if (!to) throw httpErr(422, "Add your developer's email first.")
    const resolved = await resolveTask(brandId, task)
    if (!(await consumeSend(brandId))) throw httpErr(429, `You can send ${DEV_SENDS_PER_DAY} tasks a day. Try again tomorrow, or use Copy text.`)
    const { isShopify } = await guideContext(brand, [])
    const mail = buildDeveloperEmail(brand.name, founder.name || 'the store owner', resolved, isShopify)
    try {
        await mailer({ to: [to], cc: founder.email ? [founder.email] : undefined, replyTo: founder.email || undefined, ...mail })
    } catch {
        await brandModel.updateOne({ _id: brandId, devSendCount: { $gt: 0 } }, { $inc: { devSendCount: -1 } })
        throw httpErr(502, "Couldn't send. Use Copy text instead.")
    }
    const sentAt = new Date()
    await developerSendModel.create({ brandId, userId: founder._id, to, taskKey: taskKey(task), kind: resolved.kind, sentAt })
    return { sentTo: to, sentAt }
}
