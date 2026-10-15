/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/reportOnce.check.ts
import assert from 'assert'
import mongoose from 'mongoose'
import config from '../config/config'
import databseService from '../service/databseService'
import reportModel from '../model/reportModel'
import brandModel from '../model/brandModel'
;(async () => {
    await mongoose.connect(config.DATABASE_URL as string)
    const brand = await brandModel.findOne().select('_id').lean()
    assert.ok(brand, 'needs one brand in the local DB')
    const brandId = String(brand._id)
    const before = await reportModel.countDocuments({ brandId })

    // Double click or two tabs: both requests land together and get one report
    const [a, b] = await Promise.all([databseService.generateBrandReport(brandId), databseService.generateBrandReport(brandId)])
    assert.strictEqual(String(a._id), String(b._id))
    assert.strictEqual(await reportModel.countDocuments({ brandId }), before + 1)

    // A later click is a new report
    const c = await databseService.generateBrandReport(brandId)
    assert.notStrictEqual(String(c._id), String(a._id))

    await reportModel.deleteMany({ _id: { $in: [a._id, c._id] } })
    console.log('reportOnce: ok')
    process.exit(0)
})().catch((e) => {
    console.error(e)
    process.exit(1)
})
