/* eslint-disable no-console */
// Run: SMTP_HOST= NODE_ENV=development npx ts-node --transpile-only src/checks/sendToDeveloper.check.ts
import assert from 'assert'
import mongoose from 'mongoose'
import config from '../config/config'
import brandModel from '../model/brandModel'
import recommendationModel from '../model/recommendationModel'
import developerSendModel from '../model/developerSendModel'
import { sendToDeveloper } from '../service/developerTask'
import { guideContext } from '../service/fixGuide'

type Sent = { to: string[]; subject: string; text: string; html: string; cc?: string[]; replyTo?: string }
;(async () => {
    await mongoose.connect(config.DATABASE_URL as string)
    const sent: Sent[] = []
    let fail = false
    const mailer = async (m: Sent) => {
        if (fail) throw new Error('smtp down')
        sent.push(m)
    }
    const orgId = new mongoose.Types.ObjectId()
    const brand = await brandModel.create({ orgId, name: 'Hasan Oud', website: 'https://hasanoud.com', category: 'Fragrances & Perfumes' })
    const other = await brandModel.create({ orgId, name: 'Other', website: 'https://other.com', category: 'Fragrances & Perfumes' })
    const rec = await recommendationModel.create({
        brandId: brand._id,
        text: 'Add FAQPage schema to <script>alert(1)</script> product pages',
        category: 'Technical',
        effort: 'Low effort',
        impact: 'High impact',
        snippet: '{"@type":"FAQPage"}'
    })
    const otherRec = await recommendationModel.create({
        brandId: other._id,
        text: 'x',
        category: 'Content',
        effort: 'Low effort',
        impact: 'Low impact'
    })
    const founder = { name: 'Aijaz Ahmad', email: 'owner@hasanoud.com' }
    const task = { type: 'recommendation' as const, id: String(rec._id) }
    const fresh = () => brandModel.findById(brand._id)

    // 422 without an email
    await assert.rejects(sendToDeveloper((await fresh())!, founder, task, undefined, mailer), (e: { status?: number }) => e.status === 422)
    // disposable refused
    await assert.rejects(sendToDeveloper((await fresh())!, founder, task, 'x@mailinator.com', mailer), (e: { status?: number }) => e.status === 422)
    // saves and sends
    const r = await sendToDeveloper((await fresh())!, founder, task, 'Dev@Agency.in', mailer)
    assert.equal(r.sentTo, 'dev@agency.in')
    assert.equal((await fresh())!.developerEmail, 'dev@agency.in')
    const m = sent[0]
    assert.deepEqual(m.to, ['dev@agency.in'])
    assert.deepEqual(m.cc, ['owner@hasanoud.com'])
    assert.equal(m.replyTo, 'owner@hasanoud.com')
    assert.equal(m.subject, 'Hasan Oud: Add FAQPage schema')
    assert.ok(m.html.includes('&lt;script&gt;') && !m.html.includes('<script>alert'), 'escapes task text')
    assert.ok(m.text.includes('{"@type":"FAQPage"}'), 'includes the snippet')
    assert.ok(m.text.includes('Sent by Aijaz Ahmad from Signal AI. Reply to this email to reach them.'))
    // two sends both count, the second uses the saved email
    await sendToDeveloper((await fresh())!, founder, task, undefined, mailer)
    assert.equal((await fresh())!.devSendCount, 2)
    assert.equal(await developerSendModel.countDocuments({ brandId: brand._id }), 2)
    // a failed send is refunded and reported
    fail = true
    await assert.rejects(sendToDeveloper((await fresh())!, founder, task, undefined, mailer), (e: { status?: number }) => e.status === 502)
    assert.equal((await fresh())!.devSendCount, 2)
    fail = false
    // limit 20 a day
    await brandModel.updateOne({ _id: brand._id }, { $set: { devSendCount: 20 } })
    await assert.rejects(sendToDeveloper((await fresh())!, founder, task, undefined, mailer), (e: { status?: number }) => e.status === 429)
    await brandModel.updateOne({ _id: brand._id }, { $set: { devSendCount: 2 } })
    // another brand's task → 404
    await assert.rejects(
        sendToDeveloper((await fresh())!, founder, { type: 'recommendation', id: String(otherRec._id) }, undefined, mailer),
        (e: { status?: number }) => e.status === 404
    )
    // audit check task uses the library kind
    await sendToDeveloper(
        (await fresh())!,
        founder,
        { type: 'store-audit', key: 'alt', url: 'https://hasanoud.com/products/silk' },
        undefined,
        mailer
    )
    assert.equal(sent.at(-1)!.subject, 'Hasan Oud: Add alt text to product images')
    assert.ok(sent.at(-1)!.text.includes('https://hasanoud.com/products/silk'))

    // Responses carry the last send per task, for "Sent to x · 2 days ago"
    const ctx = await guideContext((await fresh())!, [])
    assert.equal(ctx.lastSent[`recommendation:${rec._id}`]?.to, 'dev@agency.in')
    assert.ok(ctx.lastSent['store-audit:alt:https://hasanoud.com/products/silk'])

    await recommendationModel.deleteMany({ _id: { $in: [rec._id, otherRec._id] } })
    await developerSendModel.deleteMany({ brandId: brand._id })
    await brandModel.deleteMany({ _id: { $in: [brand._id, other._id] } })
    console.log('sendToDeveloper checks: PASS')
    process.exit(0)
})().catch((e) => {
    console.error(e)
    process.exit(1)
})
