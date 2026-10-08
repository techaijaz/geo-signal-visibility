/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/fixEvent.check.ts (needs the local Mongo)
import assert from 'assert'
import mongoose from 'mongoose'
import config from '../config/config'
import fixEventModel from '../model/fixEventModel'
import { recordDone, recordUndone, deleteBrandFixEvents, markVerified } from '../service/fixEventService'
import recommendationModel from '../model/recommendationModel'
import databseService from '../service/databseService'
;(async () => {
    await mongoose.connect(config.DATABASE_URL as string)
    const brandId = new mongoose.Types.ObjectId()
    const rec = (text: string) => ({ _id: new mongoose.Types.ObjectId(), brandId, text, category: 'Technical' })
    const events = (recId: unknown) => fixEventModel.find({ brandId, recommendationId: recId }).sort({ createdAt: 1 }).lean()

    try {
        // Tick → one event; tick again → still one
        const faq = rec('Add FAQ schema')
        await recordDone(faq, 'user')
        await recordDone(faq, 'user')
        let list = await events(faq._id)
        assert.equal(list.length, 1)
        assert.equal(list[0].source, 'user')
        assert.equal(list[0].verified, false)
        assert.equal(list[0].text, 'Add FAQ schema')

        // Untick → undoneAt; tick → a new open event
        await recordUndone(String(brandId), String(faq._id))
        list = await events(faq._id)
        assert.ok(list[0].undoneAt)
        await recordDone(faq, 'user')
        list = await events(faq._id)
        assert.equal(list.length, 2)
        assert.equal(list.filter((e) => !e.undoneAt).length, 1)

        // Audit on a ticked recommendation → same event verified, doneAt unchanged
        const open = list.find((e) => !e.undoneAt)!
        await recordDone(faq, 'audit')
        list = await events(faq._id)
        assert.equal(list.length, 2)
        const after = list.find((e) => !e.undoneAt)!
        assert.equal(after.verified, true)
        assert.equal(after.source, 'user')
        assert.equal(new Date(after.doneAt).getTime(), new Date(open.doneAt).getTime())

        // Audit on an untouched recommendation → its own verified audit event
        const llms = rec('Add llms.txt')
        await recordDone(llms, 'audit')
        list = await events(llms._id)
        assert.equal(list.length, 1)
        assert.equal(list[0].source, 'audit')
        assert.equal(list[0].verified, true)

        // Untick with nothing open → no error, nothing written
        await recordUndone(String(brandId), String(new mongoose.Types.ObjectId()))

        // I1: the audit confirming recommendations the user already ticked → their open events become verified, no new events
        const schema = rec('Add Product schema')
        await recordDone(schema, 'user')
        await markVerified(String(brandId), [schema._id])
        list = await events(schema._id)
        assert.equal(list.length, 1)
        assert.equal(list[0].verified, true)
        assert.equal(list[0].source, 'user')
        await markVerified(String(brandId), [new mongoose.Types.ObjectId()]) // nothing open → nothing written
        assert.equal(await fixEventModel.countDocuments({ brandId, source: 'audit', text: 'Add Product schema' }), 0)

        // I2: a recommendation of another brand can't be toggled through this brand, and gets no event
        const otherBrand = new mongoose.Types.ObjectId()
        const foreign = await recommendationModel.create({
            brandId: otherBrand,
            text: 'Foreign rec',
            category: 'Technical',
            effort: 'Low effort',
            impact: 'High impact'
        })
        try {
            assert.equal(await databseService.toggleRecommendationCompleted(String(foreign._id), String(brandId), true), null)
            assert.equal((await recommendationModel.findById(foreign._id).lean())!.isCompleted, false)
            const own = await databseService.toggleRecommendationCompleted(String(foreign._id), String(otherBrand), true)
            assert.equal(own!.isCompleted, true)
            // recordUndone scoped by brand: another brand can't close this brand's event
            await recordDone({ _id: foreign._id, brandId: otherBrand, text: 'Foreign rec' }, 'user')
            await recordUndone(String(brandId), String(foreign._id))
            assert.equal(await fixEventModel.countDocuments({ brandId: otherBrand, undoneAt: null }), 1)
        } finally {
            await recommendationModel.deleteOne({ _id: foreign._id })
            await fixEventModel.deleteMany({ brandId: otherBrand })
        }

        // Brand delete removes its events
        await deleteBrandFixEvents(String(brandId))
        assert.equal(await fixEventModel.countDocuments({ brandId }), 0)

        console.log('fixEvent checks passed')
    } finally {
        await fixEventModel.deleteMany({ brandId })
        await mongoose.disconnect()
    }
    process.exit(0)
})().catch((err) => {
    console.error(err)
    process.exit(1)
})
