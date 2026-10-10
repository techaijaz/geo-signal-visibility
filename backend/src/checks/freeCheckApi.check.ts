/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/freeCheckApi.check.ts (needs the local Mongo)
import assert from 'assert'
import mongoose from 'mongoose'
import freeCheckController from '../controller/freeCheckController'
import freeCheckModel from '../model/freeCheckModel'
import leadModel from '../model/leadModel'
import { memoryStore, KEYS } from '../service/freeCheck/store'
import { hashIp, istDay } from '../service/freeCheck/helpers'
import { leadUnsubscribeUrl } from '../service/freeCheck/emails'
import { setSetting } from '../model/appSettingModel'
import adminController from '../controller/adminController'
import { markLeadSignedUp } from '../service/freeCheck/lead'

type Body = { data?: Record<string, unknown>; message?: string }
type Res = { code: number; body: Body }
type Handler = (req: never, res: never, next: never) => unknown

// Drives a controller like Express would: resolves on res.json/res.send or on next(error)
const call = (fn: Handler, body: object = {}, params: object = {}, ip = '9.9.9.9', query: object = {}) =>
    new Promise<Res>((resolve) => {
        let code = 200
        const res = {
            status(c: number) {
                code = c
                return res
            },
            json(b: Body) {
                resolve({ code, body: b })
            },
            send(b: unknown) {
                resolve({ code, body: { message: String(b) } })
            },
            setHeader() {}
        }
        const next = (err: { statusCode?: number; message?: string }) => resolve({ code: err?.statusCode ?? 500, body: { message: err?.message } })
        void fn({ body, params, query, ip, headers: {}, method: 'POST', originalUrl: '/x' } as never, res as never, next as never)
    })

const codeIn = (text: string) => text.match(/\b\d{6}\b/)![0]

const run = async () => {
    await mongoose.connect('mongodb://127.0.0.1:27017/signal_freecheck_api_check')
    await mongoose.connection.dropDatabase()
    const sent: Array<{ to: string; subject: string; text: string }> = []
    const queued: Array<{ checkId: string; runAt?: Date }> = []
    const store = memoryStore()
    Object.assign(freeCheckController.deps, {
        store,
        turnstile: async (t?: string) => t !== 'bad',
        send: async (to: string[], subject: string, text: string) => {
            sent.push({ to: to[0], subject, text })
        },
        fetchHtml: async () => '<title>Buy Attar | Hasan Oud</title>',
        enqueue: async (checkId: string, runAt?: Date) => {
            queued.push({ checkId, runAt })
            return {}
        },
        categories: async () => ['Fragrances & Perfumes', 'Skincare & Personal Care']
    })
    const body = {
        url: 'https://hasanoud.com',
        brandName: 'Hasan Oud',
        category: 'Fragrances & Perfumes',
        questions: ['500 ke andar sabse accha attar', 'Best oud attar under ₹1000', 'Eid ke liye best attar konsa hai'],
        turnstileToken: 'ok',
        tz: 'Asia/Kolkata'
    }

    // site: brand and category from the homepage, the category's questions
    const site = await call(freeCheckController.site as Handler, { url: 'hasanoud.com' })
    assert.equal(site.code, 200)
    assert.equal(site.body.data!.brandName, 'Hasan Oud')
    assert.equal(site.body.data!.category, 'Fragrances & Perfumes')
    assert.ok((site.body.data!.questions as unknown[]).length >= 7)
    assert.equal((await call(freeCheckController.site as Handler, { url: 'http://localhost' })).code, 400)

    // create: exactly 3 listed questions, turnstile, then queued
    assert.equal((await call(freeCheckController.create as Handler, { ...body, questions: body.questions.slice(0, 2) })).code, 400)
    assert.equal(
        (await call(freeCheckController.create as Handler, { ...body, questions: [...body.questions.slice(0, 2), 'write my essay'] })).code,
        400
    )
    assert.equal((await call(freeCheckController.create as Handler, { ...body, category: 'Made Up' })).code, 400)
    assert.equal((await call(freeCheckController.create as Handler, { ...body, turnstileToken: 'bad' })).code, 403)
    const c1 = await call(freeCheckController.create as Handler, body)
    assert.equal(c1.code, 201)
    const id1 = c1.body.data!.checkId as string
    assert.equal(queued.length, 1)

    // same ip + domain, other questions → the same check, nothing queued
    const again = await call(freeCheckController.create as Handler, { ...body, questions: body.questions.slice().reverse() })
    assert.equal(again.body.data!.checkId, id1)
    assert.equal(queued.length, 1)

    // ip limit 3/day (two more domains, then refused)
    await call(freeCheckController.create as Handler, { ...body, url: 'https://a1.com' })
    await call(freeCheckController.create as Handler, { ...body, url: 'https://a2.com' })
    assert.equal((await call(freeCheckController.create as Handler, { ...body, url: 'https://a3.com' })).code, 429)

    // status: the half result has no names
    await freeCheckModel.updateOne(
        { checkId: id1 },
        {
            $set: {
                status: 'done',
                questions: body.questions.map((text) => ({
                    text,
                    answers: [
                        { engine: 'ChatGPT', ok: true, named: false, position: null, brands: ['Ajmal'] },
                        { engine: 'Gemini', ok: true, named: false, position: null, brands: ['Ajmal'] }
                    ]
                }))
            }
        }
    )
    const st = await call(freeCheckController.status as Handler, {}, { checkId: id1 })
    assert.equal(st.code, 200)
    assert.ok(!JSON.stringify(st.body).includes('Ajmal'))
    assert.equal(st.body.data!.verified, false)
    assert.equal(st.body.data!.email, undefined)
    assert.equal((await call(freeCheckController.status as Handler, {}, { checkId: 'nope' })).code, 404)

    // email: disposable refused; code sent; wrong code counts; right code unlocks names, saves the lead, sends the report
    assert.equal((await call(freeCheckController.sendCode as Handler, { email: 'x@mailinator.com' }, { checkId: id1 })).code, 400)
    assert.equal((await call(freeCheckController.sendCode as Handler, { email: 'nope' }, { checkId: id1 })).code, 400)
    assert.equal(
        (await call(freeCheckController.sendCode as Handler, { email: 'Owner@HasanOud.com', marketingConsent: true }, { checkId: id1 })).code,
        200
    )
    assert.equal(sent.length, 1) // only the code went out
    const code = codeIn(sent.at(-1)!.text)
    assert.equal((await call(freeCheckController.verify as Handler, { code: code === '000000' ? '111111' : '000000' }, { checkId: id1 })).code, 400)
    assert.equal((await call(freeCheckController.verify as Handler, { code }, { checkId: 'nope' })).code, 404)
    const ok = await call(freeCheckController.verify as Handler, { code }, { checkId: id1 })
    assert.equal(ok.code, 200)
    assert.deepEqual(ok.body.data!.otherBrands, [{ name: 'Ajmal', count: 6 }])
    const lead = await leadModel.findOne({ email: 'owner@hasanoud.com' }).lean()
    assert.equal(lead!.marketingConsent, true)
    assert.equal(lead!.country, 'IN')
    assert.deepEqual(lead!.checkIds, [id1])
    assert.ok(sent.some((m) => m.subject.includes('Hasan Oud on ChatGPT and Gemini')))
    // after verify the ip+domain cache entry is gone, so a verified visitor can run fresh questions
    assert.equal(await store.get(KEYS.cache(hashIp('9.9.9.9'), 'hasanoud.com')), null)
    // a verified check gives the signup page email, url and category; still no names
    const vst = await call(freeCheckController.status as Handler, {}, { checkId: id1 })
    assert.equal(vst.body.data!.email, 'owner@hasanoud.com')
    assert.equal(vst.body.data!.category, 'Fragrances & Perfumes')
    assert.ok(!JSON.stringify(vst.body).includes('Ajmal'))
    // the code is single use
    assert.equal((await call(freeCheckController.verify as Handler, { code }, { checkId: id1 })).code, 400)

    // 5 wrong codes → locked, even with the right code
    const c2 = (await call(freeCheckController.create as Handler, { ...body, url: 'https://b1.com' }, {}, '7.7.7.7')).body.data!.checkId as string
    await call(freeCheckController.sendCode as Handler, { email: 'b@b1.com' }, { checkId: c2 }, '7.7.7.7')
    const c2code = codeIn(sent.at(-1)!.text)
    for (let i = 0; i < 5; i++)
        await call(freeCheckController.verify as Handler, { code: c2code === '000000' ? '111111' : '000000' }, { checkId: c2 })
    assert.equal((await call(freeCheckController.verify as Handler, { code: c2code }, { checkId: c2 })).code, 429)

    // budget reached → waiting-email; after verify → scheduled for the next morning
    await setSetting('freeCheckDailyLimit', 0)
    const w = await call(freeCheckController.create as Handler, { ...body, url: 'https://c1.com' }, {}, '6.6.6.6')
    assert.equal(w.body.data!.status, 'waiting-email')
    const before = queued.length
    await call(freeCheckController.sendCode as Handler, { email: 'c@c1.com' }, { checkId: w.body.data!.checkId }, '6.6.6.6')
    const v = await call(freeCheckController.verify as Handler, { code: codeIn(sent.at(-1)!.text) }, { checkId: w.body.data!.checkId })
    assert.equal(v.body.data!.status, 'scheduled')
    assert.equal(queued.length, before + 1)
    assert.ok(queued.at(-1)!.runAt! > new Date())

    // unsubscribe link turns marketing consent off; a bad token changes nothing
    const u = new URL(leadUnsubscribeUrl('owner@hasanoud.com'))
    await call(freeCheckController.unsubscribe as Handler, {}, {}, '1.1.1.1', { e: 'owner@hasanoud.com', t: 'bad' })
    assert.equal((await leadModel.findOne({ email: 'owner@hasanoud.com' }).lean())!.marketingConsent, true)
    await call(freeCheckController.unsubscribe as Handler, {}, {}, '1.1.1.1', { e: 'owner@hasanoud.com', t: u.searchParams.get('t') })
    assert.equal((await leadModel.findOne({ email: 'owner@hasanoud.com' }).lean())!.marketingConsent, false)

    // Admin: today's use, limit change (0–5000), leads and the 7-day funnel
    Object.assign(adminController.freeCheckDeps, { store })
    const adm = await call(adminController.getFreeCheck as Handler)
    assert.equal(adm.code, 200)
    assert.equal((adm.body.data!.today as { limit: number }).limit, 0)
    assert.ok((adm.body.data!.leads as unknown[]).length >= 2)
    assert.equal((adm.body.data!.funnel as { verified: number }).verified, 2)
    assert.equal((await call(adminController.setFreeCheckLimit as Handler, { limit: -1 })).code, 400)
    assert.equal((await call(adminController.setFreeCheckLimit as Handler, { limit: 'x' })).code, 400)
    assert.equal((await call(adminController.setFreeCheckLimit as Handler, { limit: 300 })).code, 200)
    assert.equal(((await call(adminController.getFreeCheck as Handler)).body.data!.today as { limit: number }).limit, 300)
    const csv = await call(adminController.getFreeCheckLeadsCsv as Handler)
    assert.ok(csv.body.message!.startsWith('email,site,brand'))
    assert.ok(csv.body.message!.includes('owner@hasanoud.com'))

    // A failed check is not served from the cache: the visitor can try again
    const f1 = (await call(freeCheckController.create as Handler, { ...body, url: 'https://f1.com' }, {}, '5.5.5.5')).body.data!.checkId as string
    await freeCheckModel.updateOne({ checkId: f1 }, { $set: { status: 'failed' } })
    const f2 = await call(freeCheckController.create as Handler, { ...body, url: 'https://f1.com' }, {}, '5.5.5.5')
    assert.notEqual(f2.body.data!.checkId, f1)

    // The queue is down: 503, no stuck check, budget and cache given back
    const enqueueOk = freeCheckController.deps.enqueue
    freeCheckController.deps.enqueue = async () => null
    const gBefore = await store.get(KEYS.global + istDay())
    const down = await call(freeCheckController.create as Handler, { ...body, url: 'https://q1.com' }, {}, '4.4.4.4')
    assert.equal(down.code, 503)
    assert.equal(await store.get(KEYS.global + istDay()), gBefore)
    assert.equal(await store.get(KEYS.cache(hashIp('4.4.4.4'), 'q1.com')), null)
    freeCheckController.deps.enqueue = enqueueOk

    // Parallel wrong codes can't get more than 5 tries
    const p1 = (await call(freeCheckController.create as Handler, { ...body, url: 'https://p1.com' }, {}, '3.3.3.3')).body.data!.checkId as string
    await call(freeCheckController.sendCode as Handler, { email: 'p@p1.com' }, { checkId: p1 }, '3.3.3.3')
    const pcode = codeIn(sent.at(-1)!.text)
    const wrong = pcode === '000000' ? '111111' : '000000'
    await Promise.all(Array.from({ length: 12 }, () => call(freeCheckController.verify as Handler, { code: wrong }, { checkId: p1 })))
    assert.ok((await freeCheckModel.findOne({ checkId: p1 }).lean())!.otpAttempts <= 5)
    assert.equal((await call(freeCheckController.verify as Handler, { code: pcode }, { checkId: p1 })).code, 429)

    // A lead that signs up is marked; an unknown email creates nothing
    await markLeadSignedUp('OWNER@hasanoud.com')
    assert.ok((await leadModel.findOne({ email: 'owner@hasanoud.com' }).lean())!.signedUpAt)
    await markLeadSignedUp('nobody@x.com')
    assert.equal(await leadModel.countDocuments({ email: 'nobody@x.com' }), 0)

    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
    console.log('freeCheckApi checks passed')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
