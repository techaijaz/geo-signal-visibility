/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/aiProviders.check.ts
import assert from 'assert'
import aiService, { silentModels } from '../service/aiService'
import { modelScore } from '../service/databseService'

const run = async () => {
    // Engines that missed any question are reported, in the order they ran
    const a = (model: string, queryText: string) => ({ model, queryText })
    assert.deepStrictEqual(silentModels(['ChatGPT', 'Gemini', 'Claude'], [a('ChatGPT', 'q1'), a('Claude', 'q1')], 1), ['Gemini'])
    assert.deepStrictEqual(silentModels(['ChatGPT'], [a('ChatGPT', 'q1')], 1), [])
    // Old questions answered from the cache don't hide an engine that failed on a new one
    assert.deepStrictEqual(silentModels(['ChatGPT', 'DeepSeek'], [a('ChatGPT', 'q1'), a('ChatGPT', 'new'), a('DeepSeek', 'q1')], 2), ['DeepSeek'])

    // Helper calls (brand names, suggestions, product names) try the cheapest paid engine first and
    // Gemini last, so they don't use up the quota the scans need
    const order: string[] = []
    const stub = aiService as unknown as Record<string, unknown>
    stub.callOpenAiCompatible = async (provider: string) => {
        order.push(provider)
        return null
    }
    stub.callClaude = async () => {
        order.push('Anthropic')
        return null
    }
    stub.callGemini = async () => {
        order.push('Google')
        return 'from gemini'
    }
    assert.equal(await aiService.callAnyAvailableAi('p'), 'from gemini')
    assert.deepStrictEqual(order, ['DeepSeek', 'OpenAI', 'Anthropic', 'Google'])

    order.length = 0
    stub.callOpenAiCompatible = async (provider: string) => {
        order.push(provider)
        return provider === 'DeepSeek' ? 'from deepseek' : null
    }
    assert.equal(await aiService.callAnyAvailableAi('p'), 'from deepseek')
    assert.deepStrictEqual(order, ['DeepSeek'])

    // Overview: an engine's score uses the questions asked in the latest scan (5), not today's list (3)
    const fiveAsked = [true, true, false, false, false].map((mentioned) => ({ mentioned }))
    assert.deepStrictEqual(modelScore(fiveAsked), { count: 2, totalQ: 5, score: 40 })
    assert.deepStrictEqual(modelScore([]), { count: 0, totalQ: 0, score: 0 })

    console.log('ai providers checks: PASS')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
