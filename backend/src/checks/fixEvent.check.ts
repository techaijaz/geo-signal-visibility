/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/fixEvent.check.ts (needs the local Mongo)
import assert from 'assert'
import mongoose from 'mongoose'
import config from '../config/config'
import fixEventModel from '../model/fixEventModel'
import { recordDone, recordUndone, deleteBrandFixEvents } from '../service/fixEventService'
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
        await recordUndone(String(faq._id))
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
        await recordUndone(String(new mongoose.Types.ObjectId()))

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
