/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/billing.check.ts (needs the local Mongo)
import assert from 'assert'
import mongoose from 'mongoose'
import { financialYear, nextInvoiceNumber } from '../service/billing/invoiceNumber'
import { DEFAULT_SELLER, getSeller, saveSeller } from '../service/billing/seller'
import { validateJoiSchema, validationBillingSeller } from '../service/validationService'
import { activatePayment, orderInfoFromRazorpay } from '../service/billing/activatePayment'
import paymentModel from '../model/paymentModel'
import { InvoiceModel, SubscriptionModel } from '../model/billingModel'
import orgModel from '../model/orgModel'
import userModel from '../model/userModel'
import { PaymentError } from '../service/billing/prices'
import crypto from 'crypto'
import { handleRazorpayWebhook, validWebhookSignature } from '../service/billing/razorpayWebhook'

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

    // Fixtures straight into the collections (the user schema needs signup-only fields)
    const userId = new mongoose.Types.ObjectId()
    const orgId = new mongoose.Types.ObjectId()
    await userModel.collection.insertOne({ _id: userId, name: 'Owner One', email: 'owner@shop.in' })
    await orgModel.collection.insertOne({ _id: orgId, name: 'Shop One', ownerId: userId, plan: 'free' })
    const order = { orgId: String(orgId), userId: String(userId), plan: 'starter' as const, billingCycle: 'monthly' as const, amount: 2999 }
    const notes = { plan: 'starter', billingCycle: 'monthly', orgId: order.orgId, userId: order.userId }

    // Order info: notes and amount must match the price list
    assert.deepEqual(orderInfoFromRazorpay({ id: 'order_1', amount: 299900, notes }), order)
    assert.throws(() => orderInfoFromRazorpay({ id: 'order_2', amount: 100, notes }), PaymentError)
    assert.throws(() => orderInfoFromRazorpay({ id: 'order_3', amount: 299900, notes: {} }), PaymentError)

    // One payment, 10 callers at once (browser + webhook mix): one invoice, one extension, same result for all
    const sent: string[] = []
    const deps = {
        sendInvoice: async (id: string) => {
            sent.push(id)
        },
        waitMs: 5000
    }
    const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
            activatePayment(
                {
                    paymentId: 'pay_A',
                    orderId: 'order_1',
                    order,
                    gateway: 'razorpay',
                    paymentMethod: 'UPI / Card (Razorpay)',
                    source: i % 2 ? 'webhook' : 'browser'
                },
                deps
            )
        )
    )
    assert.equal(await InvoiceModel.countDocuments({ gatewayPaymentId: 'pay_A' }), 1)
    assert.equal(new Set(results.map((r) => String(r.invoice._id))).size, 1)
    assert.equal(sent.length, 1)
    const sub = await SubscriptionModel.findOne({ orgId }).lean()
    assert.equal(Math.round((sub!.currentPeriodEnd!.getTime() - sub!.currentPeriodStart!.getTime()) / 86400000), 30)
    const inv = results[0].invoice
    assert.match(inv.invoiceNumber, /^SAI\/\d{4}-\d{2}\/\d{4}$/)
    assert.equal(inv.seller.legalName, 'Aijaz Ahmad, trading as GeoSignal AI')
    assert.deepEqual({ ...inv.buyer }, { name: 'Owner One', email: 'owner@shop.in', orgName: 'Shop One' })
    assert.equal(inv.taxNote, 'GST not charged: supplier is not registered under GST.')
    assert.equal((await paymentModel.findOne({ paymentId: 'pay_A' }).lean())!.status, 'done')
    assert.equal((await orgModel.findById(orgId).lean())!.plan, 'starter')

    // Seller edited later: the issued invoice keeps its snapshot
    await saveSeller({ ...DEFAULT_SELLER, legalName: 'GeoSignal AI Pvt Ltd' })
    assert.equal((await InvoiceModel.findById(inv._id).lean())!.seller.legalName, 'Aijaz Ahmad, trading as GeoSignal AI')
    await saveSeller(DEFAULT_SELLER)

    // A claim stuck in processing for > 2 min is taken over and finished
    const base = { ...order, gateway: 'razorpay', source: 'browser' }
    await paymentModel.create({
        ...base,
        paymentId: 'pay_B',
        orderId: 'order_9',
        status: 'processing',
        claimedAt: new Date(Date.now() - 3 * 60 * 1000)
    })
    const taken = await activatePayment(
        { paymentId: 'pay_B', orderId: 'order_9', order, gateway: 'razorpay', paymentMethod: 'UPI / Card (Razorpay)', source: 'webhook' },
        { ...deps, waitMs: 300 }
    )
    assert.ok(taken.invoice.invoiceNumber)
    assert.equal((await paymentModel.findOne({ paymentId: 'pay_B' }).lean())!.status, 'done')

    // A fresh claim that doesn't finish in time: the waiting caller gets a PaymentError, no second invoice
    await paymentModel.create({ ...base, paymentId: 'pay_C', orderId: 'order_8', status: 'processing', claimedAt: new Date() })
    await assert.rejects(
        activatePayment(
            { paymentId: 'pay_C', orderId: 'order_8', order, gateway: 'razorpay', paymentMethod: 'x', source: 'webhook' },
            { ...deps, waitMs: 300 }
        ),
        PaymentError
    )
    assert.equal(await InvoiceModel.countDocuments({ gatewayPaymentId: 'pay_C' }), 0)

    // Webhook: signature over the exact raw bytes
    const secret = 'whsec_test'
    const body = Buffer.from(
        JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_W', order_id: 'order_W', method: 'upi' } } } })
    )
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
    assert.equal(validWebhookSignature(body, sig, secret), true)
    assert.equal(validWebhookSignature(Buffer.from(JSON.stringify(JSON.parse(body.toString()), null, 1)), sig, secret), false) // re-serialised
    assert.equal(validWebhookSignature(body, undefined, secret), false)

    const fetchOrder = async () => ({ id: 'order_W', amount: 299900, notes })
    const calls: string[] = []
    const activate = (async (i: { paymentId: string; source: string }) => {
        calls.push(i.paymentId + ':' + i.source)
        return { subscription: null, invoice: {} }
    }) as never
    assert.equal((await handleRazorpayWebhook(body, sig, { secret, fetchOrder, activate })).status, 200)
    assert.deepEqual(calls, ['pay_W:webhook'])
    assert.equal((await handleRazorpayWebhook(body, 'bad', { secret, fetchOrder, activate })).status, 400)
    assert.equal((await handleRazorpayWebhook(body, sig, { secret: '', fetchOrder, activate })).status, 503)
    const other = Buffer.from(JSON.stringify({ event: 'order.paid', payload: {} }))
    const otherSig = crypto.createHmac('sha256', secret).update(other).digest('hex')
    assert.equal((await handleRazorpayWebhook(other, otherSig, { secret, fetchOrder, activate })).status, 200) // ignored
    assert.equal(calls.length, 1)
    // An activation error after a valid signature still answers 200 (Razorpay retries non-2xx; the next try finishes)
    const failing = (async () => {
        throw new Error('db down')
    }) as never
    assert.equal((await handleRazorpayWebhook(body, sig, { secret, fetchOrder, activate: failing })).status, 200)

    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
    console.log('billing checks passed')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
