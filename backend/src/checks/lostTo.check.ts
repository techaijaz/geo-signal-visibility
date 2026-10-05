/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/lostTo.check.ts
import assert from 'assert'
import mongoose from 'mongoose'
import config from '../config/config'
import databseService from '../service/databseService'
import { validateNames, extractBrands } from '../service/brandExtractionService'

const answer = '1. **Ajmal Dahn Al Oudh** - long lasting\n2. Fogg Scent - budget\n3. Hasan Oud Silk\nAlso try Glowleaf.'

;(async () => {
    // Cost logs are written for each mocked AI call, so the DB must be up
    await mongoose.connect(config.DATABASE_URL as string)
    // validateNames: invented, own brand, duplicates and substrings are dropped; position from the text
    assert.deepStrictEqual(validateNames(['Ajmal', 'ajmal', 'Hasan Oud', 'Rasasi', 'Glow', 'Fogg'], answer, 'Hasan Oud'), [
        { name: 'Ajmal', position: 1 },
        { name: 'Fogg', position: 2 }
    ])
    assert.deepStrictEqual(validateNames('not an array', answer, 'X'), [])

    // extractBrands: chunk 1 good, chunk 2 broken JSON
    ;(databseService as unknown as { getDecryptedApiKey: () => Promise<string> }).getDecryptedApiKey = async () => 'k'
    let call = 0
    globalThis.fetch = (async () => {
        call++
        const text =
            call === 1 ? JSON.stringify(Object.fromEntries([...Array(10)].map((_, i) => [String(i), ['Ajmal', 'Invented']]))) : 'sorry, no json'
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 })
    }) as typeof fetch
    const answers = [...Array(12)].map((_, i) => ({ id: 'a' + i, text: answer }))
    const out = await extractBrands(answers, 'Hasan Oud')
    assert.deepStrictEqual(out.get('a0'), [{ name: 'Ajmal', position: 1 }])
    assert.deepStrictEqual(out.get('a11'), [])
    assert.equal(out.size, 12)
    console.log('lost-to checks: PASS')
    await mongoose.disconnect()
    process.exit(0)
})().catch((e) => {
    console.error(e)
    process.exit(1)
})
