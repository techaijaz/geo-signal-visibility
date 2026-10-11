/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/billing.check.ts (needs the local Mongo)
import assert from 'assert'
import mongoose from 'mongoose'
import { financialYear, nextInvoiceNumber } from '../service/billing/invoiceNumber'
import { DEFAULT_SELLER, getSeller, saveSeller } from '../service/billing/seller'
import { validateJoiSchema, validationBillingSeller } from '../service/validationService'
import { ActivationPendingError, activatePayment, orderInfoFromRazorpay } from '../service/billing/activatePayment'
import paymentModel from '../model/paymentModel'
import { InvoiceModel, SubscriptionModel } from '../model/billingModel'
import orgModel from '../model/orgModel'
import userModel from '../model/userModel'
import { PaymentError } from '../service/billing/prices'
import crypto from 'crypto'
import { handleRazorpayWebhook, validWebhookSignature } from '../service/billing/razorpayWebhook'
import { reuseOrCreateOrder } from '../service/paymentService'
import { renderInvoiceHtml, invoiceFileName, sendInvoiceEmail } from '../service/billing/invoiceDoc'
import subscriptionController from '../controller/subscriptionController'
import { paymentService } from '../service/paymentService'
import { amountInWords, paymentMethodLabel } from '../service/billing/invoiceDoc'

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

    // A fresh claim that doesn't finish in time: the waiting caller gets ActivationPendingError (retry), no second invoice
    await paymentModel.create({ ...base, paymentId: 'pay_C', orderId: 'order_8', status: 'processing', claimedAt: new Date() })
    await assert.rejects(
        activatePayment(
            { paymentId: 'pay_C', orderId: 'order_8', order, gateway: 'razorpay', paymentMethod: 'x', source: 'webhook' },
            { ...deps, waitMs: 300 }
        ),
        ActivationPendingError
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

    // Checkout: same org/plan/cycle within 15 min reuses the unpaid order; paid or older → a new one
    let created = 0
    const create = async () => ({ id: 'order_N' + ++created })
    const co = { orgId: order.orgId, userId: order.userId, plan: 'growth' as const, billingCycle: 'monthly' as const, amount: 9999 }
    const t0 = new Date()
    const o1 = await reuseOrCreateOrder(co, create, t0)
    const [o2, o3] = await Promise.all([reuseOrCreateOrder(co, create, t0), reuseOrCreateOrder(co, create, t0)])
    assert.equal(o2, o1)
    assert.equal(o3, o1)
    assert.equal(created, 1)
    assert.notEqual(await reuseOrCreateOrder({ ...co, billingCycle: 'yearly', amount: 99990 }, create, t0), o1)
    assert.notEqual(await reuseOrCreateOrder(co, create, new Date(t0.getTime() + 16 * 60 * 1000)), o1)
    await paymentModel.create({ ...co, paymentId: 'pay_R', orderId: o1, gateway: 'razorpay', status: 'done', source: 'browser' })
    assert.notEqual(await reuseOrCreateOrder(co, create, t0), o1)

    // Invoice document
    const html = renderInvoiceHtml(inv, DEFAULT_SELLER)
    assert.ok(html.includes('INVOICE') && !html.includes('Tax Invoice'))
    // ₹ needs a font that has it (DejaVu in the image); the PDF title isn't about:blank
    assert.ok(html.includes("'DejaVu Sans'") && html.includes('<title>Invoice ' + inv.invoiceNumber + '</title>'))
    assert.ok(html.includes(inv.invoiceNumber) && html.includes('Aijaz Ahmad, trading as GeoSignal AI') && html.includes('Bahraich'))
    assert.ok(html.includes('Owner One') && html.includes('Shop One') && html.includes('2,999'))
    assert.ok(html.includes('GST not charged: supplier is not registered under GST.'))
    assert.ok(html.includes('pay_A'))
    const evilInv = { ...inv, buyer: { ...inv.buyer, orgName: '<script>x</script>' } } as typeof inv
    assert.ok(!renderInvoiceHtml(evilInv, DEFAULT_SELLER).includes('<script>x'))
    assert.equal(invoiceFileName(inv), 'Invoice-' + inv.invoiceNumber.replace(/\//g, '-') + '.pdf')
    // An old invoice without a snapshot uses the current seller, marked as such
    const old = { ...inv, seller: undefined } as unknown as typeof inv
    assert.ok(renderInvoiceHtml(old, DEFAULT_SELLER).includes('details at download time'))

    // Invoice email: the PDF attached, to the buyer
    const mails: Array<{ to: string[]; subject: string; files: string[] }> = []
    await sendInvoiceEmail(String(inv._id), {
        pdf: async () => Buffer.from('%PDF-1.4'),
        send: (async (to: string[], subject: string, _t: string, o: { attachments?: Array<{ filename: string }> }) => {
            mails.push({ to, subject, files: (o.attachments || []).map((a) => a.filename) })
        }) as never
    })
    assert.deepEqual(mails[0].to, ['owner@shop.in'])
    assert.ok(mails[0].subject.includes(inv.invoiceNumber))
    assert.deepEqual(mails[0].files, [invoiceFileName(inv)])

    // PDF route: another org's member gets 404, the owner gets the file
    const otherId = new mongoose.Types.ObjectId()
    await userModel.collection.insertOne({ _id: otherId, name: 'Other', email: 'other@x.in' })
    Object.assign(subscriptionController.invoiceDeps, { pdf: async () => Buffer.from('%PDF-1.4') })
    const pdfCall = (uid: unknown, name: string) =>
        new Promise<number>((resolve) => {
            let code = 200
            const res = {
                setHeader() {},
                status(c: number) {
                    code = c
                    return res
                },
                send: () => resolve(code),
                json: () => resolve(code)
            }
            void subscriptionController.getInvoicePdf(
                { params: { id: String(inv._id) }, authenticatedUser: { _id: uid, name } } as never,
                res as never,
                ((e: { statusCode?: number }) => resolve(e?.statusCode ?? 500)) as never
            )
        })
    assert.equal(await pdfCall(otherId, 'Other'), 404)
    assert.equal(await pdfCall(userId, 'Owner One'), 200)

    // Review C1: the webhook answers 500 on a passing failure (Razorpay retries), 200 only on a permanent one
    const boom = (async () => {
        throw new Error('mongo blip')
    }) as never
    assert.equal((await handleRazorpayWebhook(body, sig, { secret, fetchOrder, activate: boom })).status, 500)
    const permanent = (async () => {
        throw new PaymentError('amount mismatch')
    }) as never
    assert.equal((await handleRazorpayWebhook(body, sig, { secret, fetchOrder, activate: permanent })).status, 200)

    // Review I1: a takeover after a half-finished activation neither extends twice nor gets stuck
    const org2 = new mongoose.Types.ObjectId()
    await orgModel.collection.insertOne({ _id: org2, name: 'Shop Two', ownerId: userId, plan: 'starter' })
    const order2 = { ...order, orgId: String(org2) }
    const end2 = new Date(Date.now() + 30 * 86400000)
    await SubscriptionModel.collection.insertOne({
        orgId: org2,
        userId,
        plan: 'starter',
        status: 'active',
        billingCycle: 'monthly',
        gatewaySubscriptionId: 'pay_D',
        currentPeriodStart: new Date(),
        currentPeriodEnd: end2,
        expiresAt: end2
    })
    await paymentModel.create({
        ...order2,
        gateway: 'razorpay',
        source: 'browser',
        paymentId: 'pay_D',
        orderId: 'order_D',
        status: 'processing',
        claimedAt: new Date(Date.now() - 3 * 60 * 1000)
    })
    await activatePayment(
        { paymentId: 'pay_D', orderId: 'order_D', order: order2, gateway: 'razorpay', paymentMethod: 'x', source: 'webhook' },
        { waitMs: 300 }
    )
    assert.equal((await SubscriptionModel.findOne({ orgId: org2 }).lean())!.expiresAt!.getTime(), end2.getTime()) // not extended again
    assert.equal(await InvoiceModel.countDocuments({ gatewayPaymentId: 'pay_D' }), 1)
    // the invoice was already written but the claim never reached done
    const prior = await InvoiceModel.findOne({ gatewayPaymentId: 'pay_D' }).lean()
    await paymentModel.updateOne({ paymentId: 'pay_D' }, { $set: { status: 'processing', claimedAt: new Date(Date.now() - 3 * 60 * 1000) } })
    const again = await activatePayment(
        { paymentId: 'pay_D', orderId: 'order_D', order: order2, gateway: 'razorpay', paymentMethod: 'x', source: 'browser' },
        { waitMs: 300 }
    )
    assert.equal(String(again.invoice._id), String(prior!._id))
    assert.equal((await paymentModel.findOne({ paymentId: 'pay_D' }).lean())!.status, 'done')

    // Review I3: two different payments for one org at once both count (30 + 365 days)
    const org3 = new mongoose.Types.ObjectId()
    await orgModel.collection.insertOne({ _id: org3, name: 'Shop Three', ownerId: userId, plan: 'free' })
    const m = { ...order, orgId: String(org3) }
    const y = { ...m, billingCycle: 'yearly' as const, amount: 29990 }
    await Promise.all([
        activatePayment({ paymentId: 'pay_M', orderId: 'order_M', order: m, gateway: 'razorpay', paymentMethod: 'x', source: 'browser' }),
        activatePayment({ paymentId: 'pay_Y', orderId: 'order_Y', order: y, gateway: 'razorpay', paymentMethod: 'x', source: 'browser' })
    ])
    const s3 = await SubscriptionModel.find({ orgId: org3 }).lean()
    assert.equal(s3.length, 1)
    assert.equal(Math.round((s3[0].expiresAt!.getTime() - Date.now()) / 86400000), 395)

    // Review I2: Stripe is not offered, so the backend refuses it
    await assert.rejects(
        paymentService.confirmPayment({
            userId: order.userId,
            orgId: order.orgId,
            plan: 'starter',
            billingCycle: 'monthly',
            gateway: 'stripe',
            gatewayOrderId: 'pi_1',
            gatewayPaymentId: 'x'
        }),
        PaymentError
    )

    await assert.rejects(
        paymentService.createCheckoutSession({
            userId: order.userId,
            orgId: order.orgId,
            plan: 'starter',
            billingCycle: 'monthly',
            gateway: 'stripe'
        }),
        PaymentError
    )

    // Invoice design: words, labels, structure
    assert.equal(amountInWords(9999), 'Rupees Nine Thousand Nine Hundred Ninety-Nine Only')
    assert.equal(amountInWords(2999), 'Rupees Two Thousand Nine Hundred Ninety-Nine Only')
    assert.equal(amountInWords(199990), 'Rupees One Lakh Ninety-Nine Thousand Nine Hundred Ninety Only')
    assert.equal(amountInWords(12500000), 'Rupees One Crore Twenty-Five Lakh Only')
    assert.equal(paymentMethodLabel('netbanking'), 'Netbanking (Razorpay)')
    assert.equal(paymentMethodLabel('upi'), 'UPI (Razorpay)')
    assert.equal(paymentMethodLabel('card'), 'Card (Razorpay)')
    assert.equal(paymentMethodLabel('wallet'), 'Wallet (Razorpay)')
    assert.equal(paymentMethodLabel('emi'), 'EMI (Razorpay)')
    assert.equal(paymentMethodLabel(undefined), 'Razorpay')
    const designed = renderInvoiceHtml(inv, DEFAULT_SELLER)
    assert.ok(designed.includes('Not registered under GST'))
    assert.ok(designed.includes('Rupees Two Thousand Nine Hundred Ninety-Nine Only'))
    assert.ok(designed.includes('computer-generated invoice'))
    assert.ok(designed.includes('Invoice no.') && designed.includes('Order ID') && designed.includes('Service period'))
    assert.ok(designed.includes('GST') && designed.includes('Not applicable'))
    assert.ok(!/tax invoice/i.test(designed))

    // A paid plan that is still running can't be swapped for a smaller one (its paid days would be lost)
    await assert.rejects(
        paymentService.createCheckoutSession({
            userId: order.userId,
            orgId: order.orgId,
            plan: 'free',
            billingCycle: 'monthly',
            gateway: 'razorpay'
        }),
        PaymentError
    )
    await SubscriptionModel.updateOne({ orgId }, { $set: { plan: 'growth' } })
    await assert.rejects(
        paymentService.createCheckoutSession({
            userId: order.userId,
            orgId: order.orgId,
            plan: 'starter',
            billingCycle: 'monthly',
            gateway: 'razorpay'
        }),
        PaymentError
    )
    // once it has lapsed, moving down is allowed again (free activates at once)
    await SubscriptionModel.updateOne({ orgId }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    const down = await paymentService.createCheckoutSession({
        userId: order.userId,
        orgId: order.orgId,
        plan: 'free',
        billingCycle: 'monthly',
        gateway: 'razorpay'
    })
    assert.equal((down as { isFree?: boolean }).isFree, true)

    // Seller form errors read as plain language, not a regex
    assert.equal(
        validateJoiSchema(validationBillingSeller, { ...DEFAULT_SELLER, pan: 'bad' }).error,
        'PAN must look like ABCDE1234F (5 letters, 4 digits, 1 letter)'
    )

    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
    console.log('billing checks passed')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
