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
    await freeCheckModel.create(base('fail1'))
    assert.equal(await runFreeCheck('fail1', { ask: async () => null, extract: extract as never, store, send }), 'failed')
    assert.equal(await store.get(KEYS.global + day), '0')
    assert.equal((await freeCheckModel.findOne({ checkId: 'fail1' }).lean())!.status, 'failed')

    // Unknown id or a check already run: nothing happens
    assert.equal(await runFreeCheck('nope', { ask, extract: extract as never, store: memoryStore(), send }), 'failed')
    assert.equal(await runFreeCheck('ok1', { ask, extract: extract as never, store: memoryStore(), send }), 'failed')

    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
    console.log('freeCheckRun checks passed')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
