/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/recommendations.check.ts (needs the local Mongo)
import assert from 'assert'
import mongoose from 'mongoose'
import config from '../config/config'
import aiService from '../service/aiService'
import databseService from '../service/databseService'
import brandModel from '../model/brandModel'
import auditModel from '../model/auditModel'
import recommendationModel from '../model/recommendationModel'
;(async () => {
    await mongoose.connect(config.DATABASE_URL as string)
    // A slow AI that gives nothing, so the built-in list is used after a delay (like a real AI call)
    ;(aiService as unknown as { callAnyAvailableAi: () => Promise<null> }).callAnyAvailableAi = () =>
        new Promise((resolve) => setTimeout(() => resolve(null), 400))

    const brand = await brandModel.create({
        orgId: new mongoose.Types.ObjectId(),
        name: 'Rec Check Brand',
        website: 'https://example.com',
        category: 'Fragrances & Perfumes'
    })
    const brandId = String(brand._id)
    // An audit already exists, so loading recommendations never starts a real audit
    await auditModel.create({ brandId: brand._id })

    try {
        const first = await databseService.findRecommendationsByBrandId(brandId)
        assert.ok(first.length > 0)

        // Re-scan while the page loads the list (the staging F2-04 case): one list, no duplicates
        const [fresh] = await Promise.all([
            databseService.rescanBrandRecommendations(brandId),
            new Promise((r) => setTimeout(r, 100)).then(() => databseService.findRecommendationsByBrandId(brandId))
        ])
        const saved = await recommendationModel.find({ brandId }).lean()
        const texts = saved.map((r) => r.text)
        assert.equal(new Set(texts).size, texts.length, `duplicate recommendations: ${texts.length} saved`)
        assert.equal(saved.length, (fresh as unknown[]).length)

        // Two page loads at once on a brand with no list: one list, not two
        await recommendationModel.deleteMany({ brandId })
        await Promise.all([databseService.findRecommendationsByBrandId(brandId), databseService.findRecommendationsByBrandId(brandId)])
        const twice = (await recommendationModel.find({ brandId }).lean()).map((r) => r.text)
        assert.equal(new Set(twice).size, twice.length, `duplicate recommendations after two loads: ${twice.length}`)

        console.log('recommendations checks: PASS')
    } finally {
        await recommendationModel.deleteMany({ brandId })
        await auditModel.deleteMany({ brandId: brand._id })
        await brandModel.deleteOne({ _id: brand._id })
        await mongoose.disconnect()
    }
    process.exit(0)
})().catch((e) => {
    console.error(e)
    process.exit(1)
})
