/**
 * Keep exactly one active model per supported AI (ChatGPT, Gemini, Claude, Grok, DeepSeek, Perplexity)
 * and deactivate every other model, including OpenRouter/OmniRoute gateway models.
 * Safe to run repeatedly.
 * Usage: node script/sync-ai-models.js
 */

const mongoose = require('mongoose')
const dotenvFlow = require('dotenv-flow')

dotenvFlow.config()

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment variables')
    process.exit(1)
}

const aiModelSchema = new mongoose.Schema(
    {
        name: String,
        modelId: { type: String, unique: true },
        provider: String,
        description: String,
        isActive: Boolean,
        isDefault: Boolean,
        inputCostPer1k: Number,
        outputCostPer1k: Number,
        maxTokens: Number
    },
    { timestamps: true }
)

const AiModel = mongoose.model('AiModel', aiModelSchema)

const targetModels = [
    {
        name: 'ChatGPT (GPT-4o Mini)',
        modelId: 'gpt-4o-mini',
        provider: 'OpenAI',
        description: 'OpenAI ChatGPT',
        isDefault: true,
        inputCostPer1k: 0.00015,
        outputCostPer1k: 0.0006,
        maxTokens: 4096
    },
    {
        // gemini-2.0-flash was retired; the -latest alias follows Google's current Flash model.
        // Check the costs against Google's price list when it moves to a new version
        name: 'Gemini Flash (latest)',
        modelId: 'gemini-flash-latest',
        provider: 'Google',
        description: 'Google Gemini',
        isDefault: false,
        inputCostPer1k: 0.0003,
        outputCostPer1k: 0.0025,
        maxTokens: 8192
    },
    {
        name: 'Claude Haiku 4.5',
        modelId: 'claude-haiku-4-5-20251001',
        provider: 'Anthropic',
        description: 'Anthropic Claude',
        isDefault: false,
        inputCostPer1k: 0.001,
        outputCostPer1k: 0.005,
        maxTokens: 4096
    },
    {
        name: 'Grok 3 Mini',
        modelId: 'grok-3-mini',
        provider: 'xAI',
        description: 'xAI Grok',
        isDefault: false,
        inputCostPer1k: 0.0003,
        outputCostPer1k: 0.0005,
        maxTokens: 4096
    },
    {
        name: 'DeepSeek v4 Flash',
        modelId: 'deepseek-v4-flash',
        provider: 'DeepSeek',
        description: 'DeepSeek',
        isDefault: false,
        inputCostPer1k: 0.00014,
        outputCostPer1k: 0.00028,
        maxTokens: 4096
    },
    {
        name: 'Perplexity Sonar',
        modelId: 'sonar',
        provider: 'Perplexity',
        description: 'Perplexity web-search grounded answers',
        isDefault: false,
        inputCostPer1k: 0.001,
        outputCostPer1k: 0.001,
        maxTokens: 4096
    }
]

async function syncAiModels() {
    try {
        console.log('🔌 Connecting to MongoDB...')
        await mongoose.connect(DATABASE_URL)
        console.log('✅ Connected to MongoDB\n')

        const targetIds = targetModels.map((m) => m.modelId)

        for (const model of targetModels) {
            const existing = await AiModel.findOne({ modelId: model.modelId })
            if (existing) {
                // Keep admin-edited name/costs, only switch it on
                await AiModel.updateOne({ _id: existing._id }, { $set: { isActive: true, provider: model.provider } })
                console.log(`   ✓ Activated: ${existing.name}`)
            } else {
                await AiModel.create({ ...model, isActive: true })
                console.log(`   ✓ Added: ${model.name}`)
            }
        }

        const deactivated = await AiModel.updateMany(
            { modelId: { $nin: targetIds }, isActive: true },
            { $set: { isActive: false, isDefault: false } }
        )
        await AiModel.updateMany({ modelId: { $ne: 'gpt-4o-mini' }, isDefault: true }, { $set: { isDefault: false } })
        await AiModel.updateOne({ modelId: 'gpt-4o-mini' }, { $set: { isDefault: true } })
        console.log(`\n   ⏸️  Deactivated ${deactivated.modifiedCount} other model(s)\n`)

        const active = await AiModel.find({ isActive: true }).sort({ provider: 1 }).lean()
        console.log('📊 Active models:')
        active.forEach((m) => console.log(`   - ${m.provider}: ${m.name} (${m.modelId})`))
    } catch (error) {
        console.error('❌ Error syncing AI models:', error.message)
        process.exitCode = 1
    } finally {
        await mongoose.disconnect()
    }
}

syncAiModels()
