# India-first Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Razorpay payment activates exactly one plan and one numbered, seller-stamped invoice (with PDF and email), even with double clicks, two tabs, a closed tab (webhook) or a browser confirm racing the webhook; the website stops claiming GST.

**Architecture:** One `activatePayment` entry point claims a payment atomically through a unique `payments.paymentId` insert; the browser confirm and the new raw-body Razorpay webhook both call it. Invoices get numbers from an atomic per-financial-year counter and a snapshot of the admin-editable seller setting; PDFs reuse the reports' Puppeteer `withBrowser`. The Billing page disables Pay while busy and polls the subscription when the browser confirm fails.

**Tech Stack:** Node 22, Express, TypeScript, Mongoose, Razorpay Node SDK, Puppeteer (existing), React 19, Astro 7.

**Spec:** `docs/superpowers/specs/2026-10-11-india-billing-design.md`

## Global Constraints

- No GST: invoice title "INVOICE", tax note `GST not charged: supplier is not registered under GST.` when `seller.gstin` is empty.
- Seller default: legalName `Aijaz Ahmad, trading as GeoSignal AI`, address `422, Madhavpur, Fakharpur, Bahraich 271902, Uttar Pradesh, India`, email `support@geosignalai.com`, pan `''`, gstin `''`; stored in `appSettings` key `billingSeller`.
- Invoice number `SAI/<FY>/<4-digit seq>`, FY = Indian financial year in IST (`2026-27` runs 1 Apr 2026 – 31 Mar 2027); counter `_id: invoice:<FY>`.
- Webhook: `POST /api/v1/payments/razorpay/webhook`, event `payment.captured`, HMAC-SHA256 of the raw body with `RAZORPAY_WEBHOOK_SECRET`; no secret → 503.
- Claim takeover after 2 minutes in `processing`; a waiting caller polls up to 10 s.
- Checkout order reuse window 15 minutes, same org + plan + cycle, unpaid.
- Billing page polling: every 3 s for up to 60 s.
- Amounts: `PLAN_PRICES` in `paymentService.ts` (rupees); Razorpay amounts are paise (×100).
- Commits: conventional, header ≤ 100 chars, body lines ≤ 100, **no Claude/Co-Authored-By trailers**, PR bodies without Claude attribution.
- Local checks: `SMTP_HOST= SMTP_USER= SMTP_PASS= NODE_ENV=development`, local Mongo `mongodb://127.0.0.1:27017/<db>`; end with `process.exit(0)`.
- Server `.env` keys have no environment prefix (`RAZORPAY_WEBHOOK_SECRET`, not `STAGING_…`).

## Review Focus

- **Browser confirm and webhook arrive within milliseconds for one payment** → one invoice, one period extension, both callers succeed. Test in Task 2.
- **Webhook body re-serialised by a JSON parser** (signature computed on parsed-then-stringified JSON) → must use the exact raw bytes; a whitespace-changed body fails. Test in Task 3.
- **Payment for an order whose notes/amount don't match the plan price** (tampered order, price changed between order and payment) → refused, no activation. Test in Task 2.
- **Invoice download by another org's member** (guessing an invoice id) → 404. Test in Task 5.
- **Popup success but `/subscription/confirm` fails** (network) → page polls and shows active once the webhook lands; never "verification failed, contact support" for a paid payment. Covered by Task 6 UI + staging N14.

---

### Task 1: Seller setting and invoice numbers

**Files:**
- Create: `backend/src/service/billing/seller.ts`, `backend/src/service/billing/invoiceNumber.ts`, `backend/src/model/counterModel.ts`, `backend/src/checks/billing.check.ts`
- Modify: `backend/src/controller/adminController.ts`, `backend/src/router/apiRouter.ts`, `backend/src/service/validationService.ts`

**Interfaces:**
- Produces:
  - `interface ISeller { legalName: string; address: string; email: string; pan: string; gstin: string }`
  - `DEFAULT_SELLER: ISeller`, `getSeller(): Promise<ISeller>`, `saveSeller(s: ISeller): Promise<void>`
  - `financialYear(d: Date): string` (`'2026-27'`), `nextInvoiceNumber(d?: Date): Promise<string>` (`'SAI/2026-27/0001'`)
  - Routes `GET/PUT /admin/billing-settings` → `ISeller`

- [ ] **Step 1: Failing check** — create `backend/src/checks/billing.check.ts`:

```ts
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
```

- [ ] **Step 2: Run — expect FAIL** (`SMTP_HOST= SMTP_USER= SMTP_PASS= NODE_ENV=development npx ts-node --transpile-only src/checks/billing.check.ts` from `backend/`): module not found.

- [ ] **Step 3: Implement**

`backend/src/model/counterModel.ts`:

```ts
import mongoose from 'mongoose'

// Atomic sequences (invoice numbers per financial year)
const counterSchema = new mongoose.Schema({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } }, { versionKey: false })
export default mongoose.model<{ _id: string; seq: number }>('Counter', counterSchema)
```

`backend/src/service/billing/invoiceNumber.ts`:

```ts
import counterModel from '../../model/counterModel'

const IST_MS = 330 * 60 * 1000

// Indian financial year (April–March) of a moment, in IST: '2026-27'
export const financialYear = (d: Date) => {
    const ist = new Date(d.getTime() + IST_MS)
    const start = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1
    return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

// SAI/2026-27/0001 — one atomic counter per financial year, so two payments never share a number
export const nextInvoiceNumber = async (d = new Date()) => {
    const fy = financialYear(d)
    const c = await counterModel.findOneAndUpdate({ _id: `invoice:${fy}` }, { $inc: { seq: 1 } }, { upsert: true, new: true })
    return `SAI/${fy}/${String(c!.seq).padStart(4, '0')}`
}
```

`backend/src/service/billing/seller.ts`:

```ts
import { getSetting, setSetting } from '../../model/appSettingModel'

export interface ISeller {
    legalName: string
    address: string
    email: string
    pan: string
    gstin: string
}

// Until the company is formed the proprietor sells (user, 11 Oct 2026); edited in Admin → Billing
export const DEFAULT_SELLER: ISeller = {
    legalName: 'Aijaz Ahmad, trading as GeoSignal AI',
    address: '422, Madhavpur, Fakharpur, Bahraich 271902, Uttar Pradesh, India',
    email: 'support@geosignalai.com',
    pan: '',
    gstin: ''
}

export const getSeller = async (): Promise<ISeller> => ({ ...DEFAULT_SELLER, ...(await getSetting<Partial<ISeller>>('billingSeller', {})) })
export const saveSeller = (s: ISeller) => setSetting('billingSeller', s)
```

`validationService.ts` (append):

```ts
export const validationBillingSeller = Joi.object({
    legalName: Joi.string().trim().min(2).max(120).required(),
    address: Joi.string().trim().min(5).max(300).required(),
    email: Joi.string().trim().email().required(),
    pan: Joi.string().trim().uppercase().allow('').pattern(/^[A-Z]{5}[0-9]{4}[A-Z]$/),
    gstin: Joi.string().trim().uppercase().allow('').pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/)
})
```

`adminController.ts` (inside `adminController`):

```ts
    getBillingSettings: async (req: Request, res: Response, next: NextFunction) => {
        try {
            httpResponse(req, res, 200, responceseMessage.SUCCESS, await getSeller())
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    saveBillingSettings: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { error, value } = validateJoiSchema<ISeller>(validationBillingSeller, req.body)
            if (error) return httpError(next, new Error(error), req, 422)
            await saveSeller(value)
            httpResponse(req, res, 200, responceseMessage.SUCCESS, value)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },
```

(imports: `getSeller, saveSeller, type ISeller` from `../service/billing/seller`; `validateJoiSchema, validationBillingSeller` from `../service/validationService`.)

Routes next to the other admin routes:

```ts
router.route('/admin/billing-settings').get(authentication, adminOnly, adminController.getBillingSettings).put(authentication, adminOnly, adminController.saveBillingSettings)
```

- [ ] **Step 4: Run — PASS**; `npx tsc --noEmit -p .`; eslint + prettier on changed files.
- [ ] **Step 5: Commit** — `feat(billing): seller setting and financial-year invoice numbers`

---

### Task 2: Payments claim and `activatePayment`

**Files:**
- Create: `backend/src/model/paymentModel.ts`, `backend/src/service/billing/activatePayment.ts`, `backend/src/service/billing/prices.ts`
- Modify: `backend/src/model/billingModel.ts` (invoice fields + unique sparse index), `backend/src/types/billingTypes.ts` (IInvoice fields), `backend/src/service/paymentService.ts` (confirmPayment uses activatePayment; export `PLAN_PRICES`, `getRazorpay`)
- Test: `backend/src/checks/billing.check.ts`

**Interfaces:**
- Consumes: `nextInvoiceNumber`, `getSeller` (Task 1).
- Produces:
  - `interface IOrderInfo { orgId: string; userId: string; plan: SubscriptionPlan; billingCycle: 'monthly' | 'yearly'; amount: number }`
  - `orderInfoFromRazorpay(order: { id: string; amount: number | string; notes?: Record<string, unknown> }): IOrderInfo` — throws `PaymentError` when notes are missing or `amount/100` ≠ `PLAN_PRICES[plan][cycle]`
  - `activatePayment(input: { paymentId: string; orderId: string; order: IOrderInfo; gateway: 'razorpay' | 'stripe' | 'mock'; paymentMethod: string; source: 'browser' | 'webhook' }, deps?: { now?: () => Date; waitMs?: number; staleMs?: number; sendInvoice?: (invoiceId: string) => Promise<unknown> }): Promise<{ subscription: unknown; invoice: IInvoice }>`
  - Invoice new fields: `seller: ISeller`, `buyer: { name: string; email: string; orgName: string }`, `period: { start: Date; end: Date }`, `gatewayOrderId: string`, `taxNote: string`.

- [ ] **Step 1: Failing assertions** (append to `run()` before cleanup; add imports):

```ts
import { activatePayment, orderInfoFromRazorpay } from '../service/billing/activatePayment'
import paymentModel from '../model/paymentModel'
import { InvoiceModel, SubscriptionModel } from '../model/billingModel'
import orgModel from '../model/orgModel'
import userModel from '../model/userModel'
import { PaymentError } from '../service/paymentService'
```

```ts
    // Fixtures: a user and an org
    const user = await userModel.create({ name: 'Owner One', email: 'owner@shop.in', password: 'x'.repeat(12), role: 'user' } as never)
    const org = await orgModel.create({ name: 'Shop One', ownerId: user._id, plan: 'free' } as never)
    const order = { orgId: String(org._id), userId: String(user._id), plan: 'starter' as const, billingCycle: 'monthly' as const, amount: 2999 }

    // Order info: notes and amount must match the price list
    assert.deepEqual(orderInfoFromRazorpay({ id: 'order_1', amount: 299900, notes: { plan: 'starter', billingCycle: 'monthly', orgId: order.orgId, userId: order.userId } }), order)
    assert.throws(() => orderInfoFromRazorpay({ id: 'order_2', amount: 100, notes: { plan: 'starter', billingCycle: 'monthly', orgId: order.orgId, userId: order.userId } }), PaymentError)
    assert.throws(() => orderInfoFromRazorpay({ id: 'order_3', amount: 299900, notes: {} }), PaymentError)

    // One payment, 10 callers at once (browser + webhook mix): one invoice, one extension, same result for all
    const sent: string[] = []
    const deps = { sendInvoice: async (id: string) => void sent.push(id), waitMs: 3000 }
    const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
            activatePayment({ paymentId: 'pay_A', orderId: 'order_1', order, gateway: 'razorpay', paymentMethod: 'UPI / Card (Razorpay)', source: i % 2 ? 'webhook' : 'browser' }, deps)
        )
    )
    assert.equal(await InvoiceModel.countDocuments({ gatewayPaymentId: 'pay_A' }), 1)
    assert.equal(new Set(results.map((r) => String(r.invoice._id))).size, 1)
    assert.equal(sent.length, 1)
    const sub = await SubscriptionModel.findOne({ orgId: org._id }).lean()
    const days = (sub!.currentPeriodEnd!.getTime() - sub!.currentPeriodStart!.getTime()) / 86400000
    assert.equal(Math.round(days), 30)
    const inv = results[0].invoice
    assert.match(inv.invoiceNumber, /^SAI\/\d{4}-\d{2}\/\d{4}$/)
    assert.equal(inv.seller.legalName, 'Aijaz Ahmad, trading as GeoSignal AI')
    assert.deepEqual({ ...inv.buyer }, { name: 'Owner One', email: 'owner@shop.in', orgName: 'Shop One' })
    assert.equal(inv.taxNote, 'GST not charged: supplier is not registered under GST.')
    assert.equal((await paymentModel.findOne({ paymentId: 'pay_A' }).lean())!.status, 'done')

    // Seller edited later: issued invoice unchanged
    await saveSeller({ ...DEFAULT_SELLER, legalName: 'GeoSignal AI Pvt Ltd' })
    assert.equal((await InvoiceModel.findById(inv._id).lean())!.seller.legalName, 'Aijaz Ahmad, trading as GeoSignal AI')

    // A claim stuck in processing for > 2 min is taken over and finished
    await paymentModel.create({ paymentId: 'pay_B', orderId: 'order_9', ...order, gateway: 'razorpay', status: 'processing', source: 'browser', claimedAt: new Date(Date.now() - 3 * 60 * 1000) })
    const taken = await activatePayment({ paymentId: 'pay_B', orderId: 'order_9', order, gateway: 'razorpay', paymentMethod: 'UPI / Card (Razorpay)', source: 'webhook' }, { ...deps, waitMs: 200 })
    assert.ok(taken.invoice.invoiceNumber)
    assert.equal((await paymentModel.findOne({ paymentId: 'pay_B' }).lean())!.status, 'done')

    // A fresh processing claim that doesn't finish in time → the waiting caller gets a PaymentError (retry later), no second invoice
    await paymentModel.create({ paymentId: 'pay_C', orderId: 'order_8', ...order, gateway: 'razorpay', status: 'processing', source: 'browser', claimedAt: new Date() })
    await assert.rejects(activatePayment({ paymentId: 'pay_C', orderId: 'order_8', order, gateway: 'razorpay', paymentMethod: 'x', source: 'webhook' }, { ...deps, waitMs: 200 }), PaymentError)
    assert.equal(await InvoiceModel.countDocuments({ gatewayPaymentId: 'pay_C' }), 0)
```

- [ ] **Step 2: Run — FAIL** (module not found).

- [ ] **Step 3: Implement**

Move `PaymentError` and `PLAN_PRICES` out of `paymentService.ts` into a new `backend/src/service/billing/prices.ts` (exported there, unchanged), and in `paymentService.ts` `import { PaymentError, PLAN_PRICES } from './billing/prices'` plus `export { PaymentError, PLAN_PRICES }` so existing imports keep working. Also `export const getRazorpay` (was `const`). This keeps `activatePayment` → `prices` free of a cycle back into `paymentService`.

`backend/src/model/paymentModel.ts`:

```ts
import mongoose from 'mongoose'

// One record per gateway payment; the unique paymentId is the claim that makes activation happen once
const paymentSchema = new mongoose.Schema(
    {
        paymentId: { type: String, required: true, unique: true },
        orderId: { type: String, required: true },
        orgId: { type: String, required: true },
        userId: { type: String, required: true },
        plan: { type: String, required: true },
        billingCycle: { type: String, required: true },
        amount: { type: Number, required: true },
        gateway: { type: String, required: true },
        status: { type: String, enum: ['processing', 'done'], default: 'processing' },
        source: { type: String, enum: ['browser', 'webhook'], required: true },
        invoiceId: { type: mongoose.Schema.Types.ObjectId, default: null },
        claimedAt: { type: Date, default: Date.now },
        doneAt: { type: Date, default: null }
    },
    { timestamps: true }
)

export default mongoose.model('Payment', paymentSchema)
```

`billingModel.ts` — invoice schema additions and index:

```ts
        seller: { type: Object, default: null },
        buyer: { type: Object, default: null },
        period: { start: Date, end: Date },
        gatewayOrderId: { type: String, default: '' },
        taxNote: { type: String, default: '' },
```

```ts
// A payment can back one invoice only (second guard behind the payments claim)
invoiceSchema.index({ gatewayPaymentId: 1 }, { unique: true, partialFilterExpression: { gatewayPaymentId: { $type: 'string' } } })
```

`billingTypes.ts` — `IInvoice` gains `seller: ISeller; buyer: { name: string; email: string; orgName: string }; period?: { start: Date; end: Date }; gatewayOrderId?: string; taxNote: string` (import `ISeller` type).

`backend/src/service/billing/activatePayment.ts`:

```ts
import paymentModel from '../../model/paymentModel'
import { InvoiceModel, SubscriptionModel } from '../../model/billingModel'
import orgModel from '../../model/orgModel'
import userModel from '../../model/userModel'
import { PaymentError, PLAN_PRICES } from './prices'
import { nextInvoiceNumber } from './invoiceNumber'
import { getSeller } from './seller'
import type { SubscriptionPlan, IInvoice } from '../../types/billingTypes'
import logger from '../../util/loger'

export interface IOrderInfo {
    orgId: string
    userId: string
    plan: SubscriptionPlan
    billingCycle: 'monthly' | 'yearly'
    amount: number
}

// Plan, cycle and org come from the order we created; the amount must be today's price for them
export const orderInfoFromRazorpay = (order: { id: string; amount: number | string; notes?: Record<string, unknown> }): IOrderInfo => {
    const n = order.notes || {}
    const plan = n.plan as SubscriptionPlan
    const billingCycle = n.billingCycle as 'monthly' | 'yearly'
    if (!PLAN_PRICES[plan] || !['monthly', 'yearly'].includes(billingCycle) || !n.orgId || !n.userId) {
        throw new PaymentError(`Order ${order.id} has no plan details`)
    }
    const amount = Number(order.amount) / 100
    if (amount !== PLAN_PRICES[plan][billingCycle]) throw new PaymentError(`Order ${order.id} amount does not match the ${plan} price`)
    return { orgId: String(n.orgId), userId: String(n.userId), plan, billingCycle, amount }
}

interface IActivateInput {
    paymentId: string
    orderId: string
    order: IOrderInfo
    gateway: 'razorpay' | 'stripe' | 'mock'
    paymentMethod: string
    source: 'browser' | 'webhook'
}

interface IDeps {
    now?: () => Date
    waitMs?: number
    staleMs?: number
    sendInvoice?: (invoiceId: string) => Promise<unknown>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const resultOf = async (invoiceId: unknown, orgId: string) => ({
    subscription: await SubscriptionModel.findOne({ orgId }).lean(),
    invoice: (await InvoiceModel.findById(invoiceId).lean()) as unknown as IInvoice
})

// Extends the plan and issues the invoice; only the claimer gets here
const fulfil = async (input: IActivateInput, now: Date) => {
    const { order } = input
    await orgModel.findByIdAndUpdate(order.orgId, { plan: order.plan })
    const existing = await SubscriptionModel.findOne({ orgId: order.orgId }).lean()
    // Renewing the same plan before it lapses extends it from the current expiry, so no paid days are lost
    const start = existing?.plan === order.plan && existing.status === 'active' && existing.expiresAt && existing.expiresAt > now ? existing.expiresAt : now
    const end = new Date(start.getTime() + (order.billingCycle === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000)
    await SubscriptionModel.findOneAndUpdate(
        { orgId: order.orgId },
        {
            userId: order.userId,
            plan: order.plan,
            status: 'active',
            billingCycle: order.billingCycle,
            gatewaySubscriptionId: input.paymentId,
            currentPeriodStart: start,
            currentPeriodEnd: end,
            expiresAt: end,
            cancelAtPeriodEnd: false
        },
        { upsert: true, new: true }
    )
    const [seller, user, org] = await Promise.all([getSeller(), userModel.findById(order.userId).lean(), orgModel.findById(order.orgId).lean()])
    const planName = order.plan.charAt(0).toUpperCase() + order.plan.slice(1)
    return InvoiceModel.create({
        invoiceNumber: await nextInvoiceNumber(now),
        orgId: order.orgId,
        userId: order.userId,
        plan: order.plan,
        amount: order.amount,
        currency: 'INR',
        status: 'paid',
        paymentMethod: input.paymentMethod,
        gateway: input.gateway,
        gatewayPaymentId: input.paymentId,
        gatewayOrderId: input.orderId,
        paidAt: now,
        period: { start, end },
        seller,
        buyer: { name: user?.name || '', email: user?.email || '', orgName: (org as { name?: string } | null)?.name || '' },
        taxNote: seller.gstin ? '' : 'GST not charged: supplier is not registered under GST.',
        items: [{ description: `Signal AI ${planName} plan (${order.billingCycle})`, amount: order.amount }]
    })
}

// The one way a payment turns into a plan: first caller claims, the rest get the same result
export const activatePayment = async (input: IActivateInput, deps: IDeps = {}) => {
    const now = deps.now ?? (() => new Date())
    const waitMs = deps.waitMs ?? 10_000
    const staleMs = deps.staleMs ?? 2 * 60 * 1000
    const { order } = input

    let claimed = false
    try {
        await paymentModel.create({ ...order, paymentId: input.paymentId, orderId: input.orderId, gateway: input.gateway, source: input.source, claimedAt: now() })
        claimed = true
    } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err
    }

    if (!claimed) {
        const deadline = Date.now() + waitMs
        for (;;) {
            const p = await paymentModel.findOne({ paymentId: input.paymentId }).lean()
            if (p?.status === 'done') return resultOf(p.invoiceId, order.orgId)
            // A claimer that died mid-way: take over after staleMs
            const took = await paymentModel.findOneAndUpdate(
                { paymentId: input.paymentId, status: 'processing', claimedAt: { $lt: new Date(now().getTime() - staleMs) } },
                { $set: { claimedAt: now(), source: input.source } },
                { new: true }
            )
            if (took) break
            if (Date.now() > deadline) throw new PaymentError('This payment is still being activated. Please refresh in a minute.')
            await sleep(150)
        }
    }

    const invoice = await fulfil(input, now())
    await paymentModel.updateOne({ paymentId: input.paymentId }, { $set: { status: 'done', invoiceId: invoice._id, doneAt: now() } })
    logger.info(`[billing] Payment ${input.paymentId} activated ${order.plan} for org ${order.orgId} (${input.source}); invoice ${invoice.invoiceNumber}`)
    if (deps.sendInvoice) await deps.sendInvoice(String(invoice._id)).catch((e) => logger.warn('[billing] invoice email failed', { meta: e }))
    return resultOf(invoice._id, order.orgId)
}
```

`paymentService.confirmPayment` — keep the gateway verification blocks; replace everything from `// A verified payment can only activate a plan once` to the end of the function with:

```ts
        const ref = gatewayPaymentId || gatewayOrderId || `mock_${Date.now()}`
        return activatePayment(
            {
                paymentId: ref,
                orderId: gatewayOrderId || ref,
                order: { orgId, userId, plan, billingCycle, amount },
                gateway: gateway as 'razorpay' | 'stripe' | 'mock',
                paymentMethod,
                source: 'browser'
            },
            { sendInvoice: sendInvoiceEmail }
        )
```

In the Razorpay branch, replace `assertOrderMatches(order.notes)` + the amount assignment with:

```ts
            const info = orderInfoFromRazorpay(await getRazorpay().orders.fetch(gatewayOrderId))
            if (info.plan !== plan || info.billingCycle !== billingCycle || info.orgId !== orgId) throw new PaymentError('Payment does not match the selected plan')
            amount = info.amount
            paymentMethod = 'UPI / Card (Razorpay)'
```

(`sendInvoiceEmail` is created in Task 5; until then pass `{}` — Task 5 swaps it in. `paymentService.ts` imports `activatePayment, orderInfoFromRazorpay` from `./billing/activatePayment`.)

- [ ] **Step 4: Run — PASS**; tsc; eslint; prettier.
- [ ] **Step 5: Commit** — `feat(billing): payments claim so one payment activates one plan`

---

### Task 3: Razorpay webhook

**Files:**
- Create: `backend/src/service/billing/razorpayWebhook.ts`
- Modify: `backend/src/app.ts` (mount before `express.json()`), `backend/.env.example`, `backend/src/config/config.ts` (`PAYMENT.RAZORPAY_WEBHOOK_SECRET`)
- Test: `backend/src/checks/billing.check.ts`

**Interfaces:**
- Consumes: `activatePayment`, `orderInfoFromRazorpay`, `getRazorpay`.
- Produces: `validWebhookSignature(raw: Buffer, signature: string | undefined, secret: string): boolean`; `handleRazorpayWebhook(raw: Buffer, signature: string | undefined, deps?: { secret?: string; fetchOrder?: (id: string) => Promise<{ id: string; amount: number; notes?: Record<string, unknown> }>; activate?: typeof activatePayment }): Promise<{ status: number; body: string }>`; Express handler `razorpayWebhookRoute`.

- [ ] **Step 1: Failing assertions**:

```ts
import crypto from 'crypto'
import { handleRazorpayWebhook, validWebhookSignature } from '../service/billing/razorpayWebhook'
```

```ts
    // Webhook: signature over the exact raw bytes
    const secret = 'whsec_test'
    const body = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_W', order_id: 'order_W', method: 'upi' } } } }))
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
    assert.equal(validWebhookSignature(body, sig, secret), true)
    assert.equal(validWebhookSignature(Buffer.from(JSON.stringify(JSON.parse(body.toString()), null, 1)), sig, secret), false) // re-serialised
    assert.equal(validWebhookSignature(body, undefined, secret), false)

    const fetchOrder = async () => ({ id: 'order_W', amount: 299900, notes: { plan: 'starter', billingCycle: 'monthly', orgId: order.orgId, userId: order.userId } })
    const calls: string[] = []
    const activate = (async (i: { paymentId: string; source: string }) => {
        calls.push(`${i.paymentId}:${i.source}`)
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
    // activation error after a valid signature still answers 200 (Razorpay retries non-2xx; the next try finishes)
    const failing = (async () => { throw new Error('db down') }) as never
    assert.equal((await handleRazorpayWebhook(body, sig, { secret, fetchOrder, activate: failing })).status, 200)
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** `backend/src/service/billing/razorpayWebhook.ts`:

```ts
import crypto from 'crypto'
import { Request, Response } from 'express'
import config from '../../config/config'
import { activatePayment, orderInfoFromRazorpay } from './activatePayment'
import { getRazorpay } from '../paymentService'
import logger from '../../util/loger'

export const validWebhookSignature = (raw: Buffer, signature: string | undefined, secret: string) => {
    if (!signature || !secret) return false
    const expected = Buffer.from(crypto.createHmac('sha256', secret).update(raw).digest('hex'))
    const given = Buffer.from(signature)
    return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}

interface IDeps {
    secret?: string
    fetchOrder?: (id: string) => Promise<{ id: string; amount: number | string; notes?: Record<string, unknown> }>
    activate?: typeof activatePayment
}

// payment.captured → the same activation as the browser confirm; anything else is acknowledged and ignored
export const handleRazorpayWebhook = async (raw: Buffer, signature: string | undefined, deps: IDeps = {}) => {
    const secret = deps.secret ?? config.PAYMENT.RAZORPAY_WEBHOOK_SECRET
    if (!secret) {
        logger.warn('[billing] Razorpay webhook called but RAZORPAY_WEBHOOK_SECRET is not set')
        return { status: 503, body: 'webhook not configured' }
    }
    if (!validWebhookSignature(raw, signature, secret)) return { status: 400, body: 'bad signature' }

    const event = JSON.parse(raw.toString('utf8')) as { event?: string; payload?: { payment?: { entity?: { id: string; order_id: string; method?: string } } } }
    const payment = event.payload?.payment?.entity
    if (event.event !== 'payment.captured' || !payment?.order_id) return { status: 200, body: 'ignored' }
    try {
        const fetchOrder = deps.fetchOrder ?? ((id: string) => getRazorpay().orders.fetch(id) as never)
        const order = orderInfoFromRazorpay(await fetchOrder(payment.order_id))
        await (deps.activate ?? activatePayment)({
            paymentId: payment.id,
            orderId: payment.order_id,
            order,
            gateway: 'razorpay',
            paymentMethod: payment.method === 'upi' ? 'UPI (Razorpay)' : 'Card (Razorpay)',
            source: 'webhook'
        })
    } catch (err) {
        // Answer 200 anyway: a retry or the browser confirm finishes the claim
        logger.error(`[billing] Webhook activation for ${payment.id} failed`, { meta: err })
    }
    return { status: 200, body: 'ok' }
}

export const razorpayWebhookRoute = async (req: Request, res: Response) => {
    const out = await handleRazorpayWebhook(req.body as Buffer, req.header('x-razorpay-signature') || undefined)
    res.status(out.status).send(out.body)
}
```

`config.ts` PAYMENT block: `RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || ''`.

`app.ts`, immediately before `app.use(express.json())`:

```ts
// Razorpay signs the exact bytes it sends: this route reads the raw body and sits outside the API router
app.post('/api/v1/payments/razorpay/webhook', express.raw({ type: 'application/json', limit: '1mb' }), razorpayWebhookRoute)
```

`.env.example`: `RAZORPAY_WEBHOOK_SECRET=` with a comment line "Razorpay Dashboard → Webhooks (event payment.captured)".

- [ ] **Step 4: Run — PASS**; tsc; eslint.
- [ ] **Step 5: Commit** — `feat(billing): razorpay webhook activates paid plans`

---

### Task 4: Checkout order reuse

**Files:**
- Create: `backend/src/model/checkoutOrderModel.ts`
- Modify: `backend/src/service/paymentService.ts` (`createCheckoutSession` Razorpay branch)
- Test: `backend/src/checks/billing.check.ts`

**Interfaces:**
- Produces: `reuseOrCreateOrder(input: { orgId: string; userId: string; plan: SubscriptionPlan; billingCycle: 'monthly' | 'yearly'; amount: number }, create: () => Promise<{ id: string }>, now?: Date): Promise<string>` (in `paymentService.ts`, exported).

- [ ] **Step 1: Failing assertions**:

```ts
import { reuseOrCreateOrder } from '../service/paymentService'
```

```ts
    // Checkout: same org/plan/cycle within 15 min reuses the unpaid order; paid or older → new
    let created = 0
    const create = async () => ({ id: `order_N${++created}` })
    const co = { orgId: order.orgId, userId: order.userId, plan: 'growth' as const, billingCycle: 'monthly' as const, amount: 9999 }
    const t0 = new Date()
    const o1 = await reuseOrCreateOrder(co, create, t0)
    const [o2, o3] = await Promise.all([reuseOrCreateOrder(co, create, t0), reuseOrCreateOrder(co, create, t0)])
    assert.equal(o2, o1)
    assert.equal(o3, o1)
    assert.equal(created, 1)
    assert.notEqual(await reuseOrCreateOrder({ ...co, billingCycle: 'yearly', amount: 99990 }, create, t0), o1)
    assert.notEqual(await reuseOrCreateOrder(co, create, new Date(t0.getTime() + 16 * 60 * 1000)), o1)
    await paymentModel.create({ paymentId: 'pay_R', orderId: o1, ...co, gateway: 'razorpay', status: 'done', source: 'browser' })
    assert.notEqual(await reuseOrCreateOrder(co, create, t0), o1)
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** `checkoutOrderModel.ts`:

```ts
import mongoose from 'mongoose'

// Razorpay orders opened from Billing; reused for 15 min so two tabs or a double click give one order
const checkoutOrderSchema = new mongoose.Schema({
    orgId: { type: String, required: true },
    plan: { type: String, required: true },
    billingCycle: { type: String, required: true },
    amount: { type: Number, required: true },
    orderId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 24 * 60 * 60 }
})
checkoutOrderSchema.index({ orgId: 1, plan: 1, billingCycle: 1, createdAt: -1 })

export default mongoose.model('CheckoutOrder', checkoutOrderSchema)
```

`paymentService.ts`:

```ts
const REUSE_MS = 15 * 60 * 1000
const opening = new Map<string, Promise<string>>()

export const reuseOrCreateOrder = async (
    input: { orgId: string; userId: string; plan: SubscriptionPlan; billingCycle: 'monthly' | 'yearly'; amount: number },
    create: () => Promise<{ id: string }>,
    now = new Date()
): Promise<string> => {
    const key = `${input.orgId}:${input.plan}:${input.billingCycle}`
    // Parallel requests in this process share one creation
    const inflight = opening.get(key)
    if (inflight) return inflight
    const work = (async () => {
        const recent = await checkoutOrderModel
            .find({ orgId: input.orgId, plan: input.plan, billingCycle: input.billingCycle, amount: input.amount, createdAt: { $gt: new Date(now.getTime() - REUSE_MS), $lte: now } })
            .sort({ createdAt: -1 })
            .lean()
        for (const r of recent) if (!(await paymentModel.exists({ orderId: r.orderId }))) return r.orderId
        const o = await create()
        await checkoutOrderModel.create({ ...input, orderId: o.id, createdAt: now })
        return o.id
    })()
    opening.set(key, work)
    try {
        return await work
    } finally {
        opening.delete(key)
    }
}
```

Razorpay branch of `createCheckoutSession`: replace the `rzp.orders.create(...)` call with

```ts
            const orderId = await reuseOrCreateOrder({ orgId, userId, plan, billingCycle, amount }, () =>
                rzp.orders.create({ amount: amount * 100, currency: 'INR', receipt: `rcpt_${orgId}_${Date.now()}`, notes: { plan, billingCycle, orgId, userId } }) as Promise<{ id: string }>
            )
```

and return `orderId` in place of `order.id`.

- [ ] **Step 4: Run — PASS**; tsc; eslint.
- [ ] **Step 5: Commit** — `feat(billing): reuse an open checkout order for 15 minutes`

---

### Task 5: Invoice PDF, download route, invoice email

**Files:**
- Create: `backend/src/service/billing/invoiceDoc.ts`
- Modify: `backend/src/controller/subscriptionController.ts` (PDF route), `backend/src/router/apiRouter.ts`, `backend/src/service/paymentService.ts` (pass `sendInvoiceEmail`)
- Test: `backend/src/checks/billing.check.ts`

**Interfaces:**
- Consumes: `withBrowser` (`service/reportService/pdfService.ts`), `layout` (`service/emailTemplates.ts`), `emailService.sendEmail(to, subject, text, { html, attachments })`.
- Produces: `renderInvoiceHtml(inv: IInvoice, fallbackSeller: ISeller): string`; `invoicePdf(inv: IInvoice): Promise<Buffer>`; `invoiceFileName(inv: IInvoice): string` (`Invoice-SAI-2026-27-0001.pdf`); `sendInvoiceEmail(invoiceId: string, deps?: { pdf?: (inv: IInvoice) => Promise<Buffer>; send?: typeof emailService.sendEmail }): Promise<void>`; route `GET /subscription/invoices/:id/pdf`.

- [ ] **Step 1: Failing assertions**:

```ts
import { renderInvoiceHtml, invoiceFileName, sendInvoiceEmail } from '../service/billing/invoiceDoc'
import subscriptionController from '../controller/subscriptionController'
```

```ts
    // Invoice document
    const html = renderInvoiceHtml(inv, DEFAULT_SELLER)
    assert.ok(html.includes('INVOICE') && !html.includes('Tax Invoice'))
    assert.ok(html.includes(inv.invoiceNumber) && html.includes('Aijaz Ahmad, trading as GeoSignal AI') && html.includes('Bahraich'))
    assert.ok(html.includes('Owner One') && html.includes('Shop One') && html.includes('2,999'))
    assert.ok(html.includes('GST not charged: supplier is not registered under GST.'))
    assert.ok(html.includes('pay_A'))
    const evilInv = { ...inv, buyer: { ...inv.buyer, orgName: '<script>x</script>' } } as typeof inv
    assert.ok(!renderInvoiceHtml(evilInv, DEFAULT_SELLER).includes('<script>x'))
    assert.equal(invoiceFileName(inv), `Invoice-${inv.invoiceNumber.replace(/\//g, '-')}.pdf`)
    // An old invoice without a snapshot uses the current seller, marked as such
    const old = { ...inv, seller: undefined } as unknown as typeof inv
    assert.ok(renderInvoiceHtml(old, DEFAULT_SELLER).includes('details at download time'))

    // Invoice email: PDF attached, to the buyer
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

    // PDF route: another org's member gets 404
    const other = await userModel.create({ name: 'Other', email: 'other@x.in', password: 'x'.repeat(12), role: 'user' } as never)
    const pdfCall = (userId: unknown) =>
        new Promise<number>((resolve) => {
            const res = { setHeader() {}, status(c: number) { return { send: () => resolve(c), json: () => resolve(c) } }, send: () => resolve(200) }
            void subscriptionController.getInvoicePdf(
                { params: { id: String(inv._id) }, authenticatedUser: { _id: userId, name: 'X' } } as never,
                res as never,
                ((e: { statusCode?: number }) => resolve(e?.statusCode ?? 500)) as never
            )
        })
    Object.assign(subscriptionController.invoiceDeps, { pdf: async () => Buffer.from('%PDF-1.4') })
    assert.equal(await pdfCall(other._id), 404)
    assert.equal(await pdfCall(user._id), 200)
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** `backend/src/service/billing/invoiceDoc.ts`:

```ts
import emailService from '../emailService'
import { layout } from '../emailTemplates'
import { withBrowser } from '../reportService/pdfService'
import { InvoiceModel } from '../../model/billingModel'
import config from '../../config/config'
import { getSeller, type ISeller } from './seller'
import type { IInvoice } from '../../types/billingTypes'

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`
const day = (d?: Date | string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '')

export const invoiceFileName = (inv: IInvoice) => `Invoice-${inv.invoiceNumber.replace(/\//g, '-')}.pdf`

// A4 invoice; "INVOICE" (never "Tax Invoice") while the seller has no GSTIN
export const renderInvoiceHtml = (inv: IInvoice, fallbackSeller: ISeller) => {
    const seller = inv.seller || fallbackSeller
    const fromNow = inv.seller ? '' : ' <span style="color:#888">(details at download time)</span>'
    const period = inv.period?.start ? `${day(inv.period.start)} – ${day(inv.period.end)}` : ''
    const item = inv.items?.[0]?.description || `Signal AI ${inv.plan} plan`
    return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:Arial,Helvetica,sans-serif;color:#0F2629;margin:40px;font-size:13px}
h1{font-size:26px;letter-spacing:.08em;margin:0}
.row{display:flex;justify-content:space-between;gap:24px;margin-top:28px}
.box{flex:1}.label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#52676A;margin-bottom:4px}
table{width:100%;border-collapse:collapse;margin-top:28px}th,td{text-align:left;padding:10px;border-bottom:1px solid #E4E9E7}
th{background:#F2F4F1;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#52676A}td.amt,th.amt{text-align:right}
.total{font-size:16px;font-weight:bold}.note{margin-top:24px;color:#33484B}
</style></head><body>
<div class="row" style="margin-top:0;align-items:flex-start"><div><h1>INVOICE</h1><div style="margin-top:6px;color:#52676A">Signal AI</div></div>
<div style="text-align:right"><div><b>${esc(inv.invoiceNumber)}</b></div><div>Date: ${day(inv.paidAt || inv.createdAt)}</div></div></div>
<div class="row"><div class="box"><div class="label">From</div><b>${esc(seller.legalName)}</b>${fromNow}<br/>${esc(seller.address)}<br/>${esc(seller.email)}${seller.pan ? `<br/>PAN ${esc(seller.pan)}` : ''}${seller.gstin ? `<br/>GSTIN ${esc(seller.gstin)}` : ''}</div>
<div class="box"><div class="label">Billed to</div><b>${esc(inv.buyer?.name || '')}</b><br/>${esc(inv.buyer?.orgName || '')}<br/>${esc(inv.buyer?.email || '')}</div></div>
<table><tr><th>Description</th><th>Period</th><th class="amt">Amount</th></tr>
<tr><td>${esc(item)}</td><td>${esc(period)}</td><td class="amt">${rupees(inv.amount)}</td></tr>
<tr><td colspan="2" class="total">Total</td><td class="amt total">${rupees(inv.amount)}</td></tr></table>
<div class="note">Paid via ${esc(inv.paymentMethod)}${inv.gatewayPaymentId ? `, payment ${esc(inv.gatewayPaymentId)}` : ''}.</div>
${inv.taxNote ? `<div class="note">${esc(inv.taxNote)}</div>` : ''}
<div class="note" style="color:#52676A">Questions? ${esc(seller.email)}</div>
</body></html>`
}

export const invoicePdf = async (inv: IInvoice) =>
    withBrowser(async (browser) => {
        const page = await browser.newPage()
        await page.setContent(renderInvoiceHtml(inv, await getSeller()), { waitUntil: 'domcontentloaded' })
        return Buffer.from(await page.pdf({ format: 'A4', printBackground: true }))
    })

// After activation: the invoice with its PDF to the paying user
export const sendInvoiceEmail = async (invoiceId: string, deps: { pdf?: (inv: IInvoice) => Promise<Buffer>; send?: typeof emailService.sendEmail } = {}) => {
    const inv = (await InvoiceModel.findById(invoiceId).lean()) as unknown as IInvoice | null
    if (!inv?.buyer?.email) return
    const pdf = await (deps.pdf ?? invoicePdf)(inv)
    const billing = `${(config.FRONTEND_URL || '').replace(/\/$/, '')}/billing`
    const subject = `Your Signal AI invoice ${inv.invoiceNumber}`
    const html = layout({
        preheader: `${rupees(inv.amount)} paid for your Signal AI plan.`,
        title: 'Thanks for your payment',
        intro: `We received ${esc(rupees(inv.amount))} for <b>${esc(inv.items?.[0]?.description || 'your plan')}</b>${inv.period?.start ? `, ${esc(day(inv.period.start))} – ${esc(day(inv.period.end))}` : ''}. Your invoice ${esc(inv.invoiceNumber)} is attached.`,
        button: { label: 'Open billing', url: billing },
        note: inv.taxNote ? esc(inv.taxNote) : undefined
    })
    const text = `${subject}\n\nWe received ${rupees(inv.amount)}. Invoice attached.\n\nBilling: ${billing}`
    await (deps.send ?? emailService.sendEmail)([inv.buyer.email], subject, text, { html, attachments: [{ filename: invoiceFileName(inv), content: pdf }] })
}
```

`subscriptionController.ts` — add `invoiceDeps: { pdf: invoicePdf as (inv: IInvoice) => Promise<Buffer> }` and:

```ts
    getInvoicePdf: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const org = await ensureUserOrg(authenticatedUser._id.toString(), authenticatedUser.name)
            const inv = (await InvoiceModel.findOne({ _id: req.params.id, orgId: org._id }).lean()) as unknown as IInvoice | null
            if (!inv) return httpError(next, new Error('Invoice not found'), req, 404)
            const pdf = await subscriptionController.invoiceDeps.pdf(inv).catch(() => null)
            if (!pdf) return httpError(next, new Error('Invoice PDF is not available right now'), req, 503)
            res.setHeader('Content-Type', 'application/pdf')
            res.setHeader('Content-Disposition', `attachment; filename="${invoiceFileName(inv)}"`)
            res.send(pdf)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },
```

(Turn `export default {` into `const subscriptionController = {` … `export default subscriptionController` for the self-reference, as done for `adminController`.) Route: `router.route('/subscription/invoices/:id/pdf').get(authentication, subscriptionController.getInvoicePdf)`.

`paymentService.confirmPayment`: pass `{ sendInvoice: sendInvoiceEmail }` (import from `./billing/invoiceDoc`). Webhook (Task 3) `activatePayment` call: add the same second argument.

- [ ] **Step 4: Run — PASS**; tsc; eslint.
- [ ] **Step 5: Commit** — `feat(billing): invoice pdf, download and invoice email`

---

### Task 6: Billing page and admin seller form

**Files:**
- Modify: `frontend/src/pages/Billing.tsx`, `frontend/src/pages/admin/AdminBilling.tsx`

No frontend test runner: verified by `npx tsc --noEmit -p tsconfig.app.json`, `npx oxlint <files>`, `npm run build`, and the staging cases in Task 8.

- [ ] **Step 1: Stripe only with a key.** Replace

```tsx
  const stripePromise = useRef(
    loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '')
  );
```

with

```tsx
  // Stripe is loaded only when a publishable key is configured
  const stripePromise = useRef(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) : null);
```

and where `<Elements stripe={stripePromise.current}>` renders, guard with `stripePromise.current &&`.

- [ ] **Step 2: Confirming state and polling.** In `openRazorpayPopup`, set `name: 'Signal AI'`, remove the placeholder `image`, and replace the `handler` body with:

```tsx
            setMessage({ text: 'Confirming your payment…', type: 'success' });
            try {
              await api.post('/subscription/confirm', {
                plan: session.plan,
                billingCycle,
                gateway: 'razorpay',
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              });
              setCurrentPlan(session.plan);
              setMessage({ text: `Your ${session.plan.charAt(0).toUpperCase() + session.plan.slice(1)} plan is active. Your invoice is on its way by email.`, type: 'success' });
              fetchBillingData();
              resolve();
            } catch {
              // The webhook activates paid plans too: wait for it before showing anything alarming
              const active = await waitForPlan(session.plan);
              setMessage(
                active
                  ? { text: `Your ${session.plan} plan is active.`, type: 'success' }
                  : { text: `Payment received (ID ${response.razorpay_payment_id}). We're activating your plan; this can take a few minutes and we'll email your invoice.`, type: 'success' }
              );
              if (active) setCurrentPlan(session.plan);
              fetchBillingData();
              resolve();
            }
```

and add, near `fetchBillingData`:

```tsx
  // Up to 60 s: the plan shows active once the browser confirm or the webhook has run
  const waitForPlan = async (plan: string) => {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await api.get('/subscription');
        if (res.data?.data?.currentPlan === plan) return true;
      } catch {
        /* keep waiting */
      }
    }
    return false;
  };
```

- [ ] **Step 3: One click.** At the top of `handleSelectPlan`: `if (processingPlan) return;`, and in the plan button render `disabled={!!processingPlan}` with label `processingPlan === plan.id ? 'Opening payment…' : <existing label>`.

- [ ] **Step 4: PDF link.** In the invoice table row and the invoice modal add a "Download PDF" button:

```tsx
  const downloadPdf = async (inv: Invoice) => {
    try {
      const res = await api.get(`/subscription/invoices/${inv._id}/pdf`, { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(res.data);
      a.download = `Invoice-${inv.invoiceNumber.replace(/\//g, '-')}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setMessage({ text: 'The invoice PDF is not available right now. Try again in a minute.', type: 'error' });
    }
  };
```

(`Invoice` type gains `_id: string` if missing.)

- [ ] **Step 5: Admin seller form.** In `AdminBilling.tsx` add a panel "Seller details (on invoices)": fields Legal name, Address (textarea), Email, PAN, GSTIN; loads `GET /admin/billing-settings`, saves `PUT /admin/billing-settings`, shows the server's validation message on 422; under GSTIN the note "GST invoices are not built yet; invoices stay without GST." Follow the page's existing `panel`/input styles.

- [ ] **Step 6: Verify** — tsc, oxlint (no new warnings), build. **Commit** — `feat(billing): one-click pay, confirming state, invoice pdf and seller form`

---

### Task 7: Website copy without GST

**Files:**
- Modify: `website/src/components/PricingPlans.astro`, `website/src/pages/pricing.astro`, `website/src/pages/legal/terms.astro`, `website/src/components/Footer.astro`, `website/src/config/site.ts`

- [ ] **Step 1:** Replace exactly:
  - `PricingPlans.astro`: `'Billed monthly, GST included'` → `'Billed monthly in ₹'` (both occurrences).
  - `pricing.astro` FAQ: question `'Are prices inclusive of GST?'` → `'Do you charge GST?'`, answer → `'Not at the moment: we are not GST-registered yet, so the price you see is the price you pay.'`; meta description: remove `", GST included"` / `"GST included"` wording.
  - `terms.astro`: `Prices are in Indian rupees and include GST.` → `Prices are in Indian rupees. We are not registered under GST, so no GST is charged.`
  - `Footer.astro`: delete the `<p>GSTIN {company.gstin}</p>` line.
  - `site.ts` `company`: legal name `Aijaz Ahmad, trading as GeoSignal AI`, address `422, Madhavpur, Fakharpur, Bahraich 271902, Uttar Pradesh, India`; remove `gstin`.
- [ ] **Step 2:** `cd website && npm run build`; `grep -rn "GST included\|include GST\|\[GSTIN\]\|\[Registered" website/src` returns nothing.
- [ ] **Step 3: Commit** — `fix(website): no gst claim while not registered, seller details`

---

### Task 8: Release to staging and Test Sheet

- [ ] PR (no Claude attribution in body), checks green, user merges; deploy staging.
- [ ] User: Razorpay Dashboard (Test Mode) → Settings → Webhooks → Add: URL `https://app.staging.geosignalai.com/api/v1/payments/razorpay/webhook`, event `payment.captured`, secret → staging `.env` `RAZORPAY_WEBHOOK_SECRET=…` (no prefix) → `docker compose up -d --no-build api worker`.
- [ ] Verify: container has the secret (length only); a POST with a bad signature → 400.
- [ ] Test Sheet **N14**: +ve — pay Starter with UPI `success@razorpay` (plan active once, invoice `SAI/2026-27/000N`, PDF downloads, invoice email with PDF), close the tab right after paying (webhook activates within a minute), Admin seller form saves and new invoices use it; −ve — double-click Pay (one order), bad webhook signature (400), another org's invoice PDF (404), website pricing/terms show no GST claim.
- [ ] Tester agent on staging; production after the user's go-ahead with live keys and the production webhook.
