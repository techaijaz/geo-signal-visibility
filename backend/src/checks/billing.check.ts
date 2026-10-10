/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/billing.check.ts (needs the local Mongo)
import assert from 'assert'
import mongoose from 'mongoose'
import { financialYear, nextInvoiceNumber } from '../service/billing/invoiceNumber'
import { DEFAULT_SELLER, getSeller, saveSeller } from '../service/billing/seller'
import { validateJoiSchema, validationBillingSeller } from '../service/validationService'

const run = async () => {
    await mongoose.connect('mongodb://127.0.0.1:27017/signal_billing_check')
    await mongoose.connection.dropDatabase()

    // Indian financial year in IST: 1 April starts a new one
    assert.equal(financialYear(new Date('2026-03-31T18:29:00Z')), '2025-26') // 23:59 IST 31 Mar
    assert.equal(financialYear(new Date('2026-03-31T18:30:00Z')), '2026-27') // 00:00 IST 1 Apr
    assert.equal(financialYear(new Date('2027-01-15T00:00:00Z')), '2026-27')

    // Numbers: sequential per FY, unique under 20 parallel calls
    const d = new Date('2026-10-11T00:00:00Z')
    assert.equal(await nextInvoiceNumber(d), 'SAI/2026-27/0001')
    const many = await Promise.all(Array.from({ length: 20 }, () => nextInvoiceNumber(d)))
    assert.equal(new Set(many).size, 20)
    assert.ok(many.includes('SAI/2026-27/0021'))
    assert.equal(await nextInvoiceNumber(new Date('2027-04-01T00:00:00Z')), 'SAI/2027-28/0001')

    // Seller: defaults until saved; validation
    assert.deepEqual(await getSeller(), DEFAULT_SELLER)
    assert.equal(DEFAULT_SELLER.legalName, 'Aijaz Ahmad, trading as GeoSignal AI')
    await saveSeller({ ...DEFAULT_SELLER, pan: 'ABCDE1234F' })
    assert.equal((await getSeller()).pan, 'ABCDE1234F')
    await saveSeller(DEFAULT_SELLER)
    assert.ok(validateJoiSchema(validationBillingSeller, { ...DEFAULT_SELLER, pan: 'bad' }).error)
    assert.ok(validateJoiSchema(validationBillingSeller, { ...DEFAULT_SELLER, gstin: '123' }).error)
    assert.ok(!validateJoiSchema(validationBillingSeller, { ...DEFAULT_SELLER, gstin: '09ABCDE1234F1Z5' }).error)
    assert.ok(validateJoiSchema(validationBillingSeller, { ...DEFAULT_SELLER, legalName: 'A' }).error)

    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
    console.log('billing checks passed')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
