/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/freeCheckRun.check.ts (needs the local Mongo)
import assert from 'assert'
import mongoose from 'mongoose'
import freeCheckModel from '../model/freeCheckModel'
import { runFreeCheck } from '../service/freeCheck/runFreeCheck'
import { memoryStore, KEYS } from '../service/freeCheck/store'
import { istDay } from '../service/freeCheck/helpers'

const base = (checkId: string) => ({
    checkId,
    url: 'https://hasanoud.com/',
    domain: 'hasanoud.com',
    brandName: 'Hasan Oud',
    category: 'Fragrances & Perfumes',
    market: 'IN',
    ipHash: 'h',
    country: 'IN',
    status: 'queued',
    questions: ['best attar', 'oud under 1000', 'eid attar'].map((text) => ({ text, answers: [] }))
})

const run = async () => {
    await mongoose.connect('mongodb://127.0.0.1:27017/signal_freecheck_check')
    await mongoose.connection.dropDatabase()
    const extract = async (answers: { id: string; text: string }[]) =>
        new Map(answers.map((a) => [a.id, a.text.includes('Ajmal') ? [{ name: 'Ajmal', position: 1 }] : []]))
    const send = async () => undefined

    // Both engines answer: 6 answers, brand found where named, other brands kept
    await freeCheckModel.create(base('ok1'))
    const ask = async (provider: string) => (provider === 'OpenAI' ? '1. Ajmal\n2. Hasan Oud' : 'Try Ajmal')
    assert.equal(await runFreeCheck('ok1', { ask, extract: extract as never, store: memoryStore(), send }), 'done')
    const ok1 = await freeCheckModel.findOne({ checkId: 'ok1' }).lean()
    assert.equal(ok1!.status, 'done')
    assert.equal(ok1!.questions[0].answers.length, 2)
    assert.equal(ok1!.questions[0].answers.find((a) => a.engine === 'ChatGPT')!.named, true)
    assert.equal(ok1!.questions[0].answers.find((a) => a.engine === 'Gemini')!.named, false)
    assert.deepEqual(ok1!.questions[0].answers[0].brands, ['Ajmal'])

    // One engine fails: still done, its answers ok=false
    await freeCheckModel.create(base('half1'))
    const askHalf = async (provider: string) => (provider === 'OpenAI' ? null : 'Ajmal')
    assert.equal(await runFreeCheck('half1', { ask: askHalf, extract: extract as never, store: memoryStore(), send }), 'done')
    const half1 = await freeCheckModel.findOne({ checkId: 'half1' }).lean()
    assert.equal(half1!.questions[0].answers.find((a) => a.engine === 'ChatGPT')!.ok, false)

    // Both fail: failed, the day's global count given back
    const store = memoryStore()
    const day = istDay()
    await store.incr(KEYS.global + day, 60)
    await freeCheckModel.create({ ...base('fail1'), budgetDay: day }) // queued from the API: budget already taken
    assert.equal(await runFreeCheck('fail1', { ask: async () => null, extract: extract as never, store, send }), 'failed')
    assert.equal(await store.get(KEYS.global + day), '0')
    assert.equal((await freeCheckModel.findOne({ checkId: 'fail1' }).lean())!.status, 'failed')

    // Unknown id or a check already run: nothing happens
    assert.equal(await runFreeCheck('nope', { ask, extract: extract as never, store: memoryStore(), send }), 'failed')
    assert.equal(await runFreeCheck('ok1', { ask, extract: extract as never, store: memoryStore(), send }), 'failed')

    // A verified, scheduled check emails its report when it finishes; an unverified one does not
    const mails: string[] = []
    const sendTo = async (to: string[]) => {
        mails.push(to[0])
    }
    await freeCheckModel.create({ ...base('sched1'), status: 'scheduled', email: 'o@hasanoud.com', verifiedAt: new Date() })
    await runFreeCheck('sched1', { ask, extract: extract as never, store: memoryStore(), send: sendTo })
    await freeCheckModel.create(base('plain1'))
    await runFreeCheck('plain1', { ask, extract: extract as never, store: memoryStore(), send: sendTo })
    assert.deepEqual(mails, ['o@hasanoud.com'])

    // A next-morning run takes its place in that day's budget; over it, it moves to the next morning again
    const day2 = istDay()
    const bstore = memoryStore()
    const later: Date[] = []
    const reschedule = async (_id: string, runAt?: Date) => {
        later.push(runAt!)
        return {}
    }
    await freeCheckModel.create({ ...base('sched2'), status: 'scheduled', email: 'p@hasanoud.com', verifiedAt: new Date() })
    assert.equal(await runFreeCheck('sched2', { ask, extract: extract as never, store: bstore, send, limit: 1, enqueue: reschedule }), 'done')
    assert.equal(await bstore.get(KEYS.global + day2), '1')
    await freeCheckModel.create({ ...base('sched3'), status: 'scheduled', email: 'q@hasanoud.com', verifiedAt: new Date() })
    assert.equal(await runFreeCheck('sched3', { ask, extract: extract as never, store: bstore, send, limit: 1, enqueue: reschedule }), 'scheduled')
    assert.equal(later.length, 1)
    assert.equal((await freeCheckModel.findOne({ checkId: 'sched3' }).lean())!.status, 'scheduled')
    // a failed next-morning run gives back only what it took
    await freeCheckModel.create({ ...base('sched4'), status: 'scheduled', email: 'r@hasanoud.com', verifiedAt: new Date() })
    assert.equal(
        await runFreeCheck('sched4', { ask: async () => null, extract: extract as never, store: bstore, send, limit: 5, enqueue: reschedule }),
        'failed'
    )
    assert.equal(await bstore.get(KEYS.global + day2), '1')

    // Verified while it was still queued: the report goes out when the run finishes
    const early: string[] = []
    await freeCheckModel.create(base('early1'))
    await freeCheckModel.updateOne({ checkId: 'early1' }, { $set: { email: 'e@hasanoud.com', verifiedAt: new Date() } })
    await runFreeCheck('early1', { ask, extract: extract as never, store: memoryStore(), send: async (to: string[]) => void early.push(to[0]) })
    assert.deepEqual(early, ['e@hasanoud.com'])

    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
    console.log('freeCheckRun checks passed')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
