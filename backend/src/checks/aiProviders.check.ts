/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/aiProviders.check.ts
import assert from 'assert'
import aiService, { silentModels } from '../service/aiService'

const run = async () => {
    // Engines that gave no answer at all in a scan are reported, in the order they ran
    assert.deepStrictEqual(silentModels(['ChatGPT', 'Gemini', 'Claude'], [{ model: 'ChatGPT' }, { model: 'Claude' }, { model: 'ChatGPT' }]), [
        'Gemini'
    ])
    assert.deepStrictEqual(silentModels(['ChatGPT'], [{ model: 'ChatGPT' }]), [])

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

    console.log('ai providers checks: PASS')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
