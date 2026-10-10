# India-first billing: invoices without GST, Razorpay webhook, safe payments — design

Feature #16 in `COMPETITIVE-FEATURES.md`. Agreed in chat on 2026-10-11.

## Goal

A customer pays by UPI or card through Razorpay and always ends up with exactly one active plan and one correct invoice, even if they double-click, open two tabs, or close the tab right after paying. The invoice is a proper, numbered document with the seller's details and a PDF, and nothing on the website claims GST that isn't charged.

Success: on staging in Razorpay test mode, paying with `success@razorpay` activates the plan once and gives one invoice; closing the tab before the browser confirm still activates the plan (webhook); a parallel browser confirm and webhook for the same payment give one invoice and one period extension.

## Background (what exists)

- Razorpay is the default gateway (`Billing.tsx`): `POST /subscription/checkout` creates an order (`notes: { plan, billingCycle, orgId, userId }`), the popup pays, `POST /subscription/confirm` verifies the HMAC signature and calls `paymentService.confirmPayment`, which extends the subscription and creates an invoice.
- Problems found:
  1. **Race:** `confirmPayment` checks `InvoiceModel.exists({ gatewayPaymentId })` and then creates. Two callers at once both pass; there is no unique index on `gatewayPaymentId` (only on `invoiceNumber`). A webhook would make this a real double-extension and double-invoice bug.
  2. **No webhook:** if the tab closes after paying, the plan never activates although the money was taken.
  3. **Invoice number** = `INV-<year>-<count+1001>`: two payments at once can get the same number (then the unique index throws after the subscription was already extended).
  4. Invoices have no seller details and no PDF (only browser print).
  5. `Billing.tsx` calls `loadStripe('')` on load (console error) though Stripe isn't used.
  6. The website says prices "include GST"; the business is **not GST-registered**.

## Decisions

| Topic | Decision |
|---|---|
| GST | Not registered: no GST on invoices; the invoice says so. GST breakup is a later feature (when a GSTIN is set). |
| Seller | Admin-editable setting. Initial values: **"Aijaz Ahmad, trading as GeoSignal AI"**, **"422, Madhavpur, Fakharpur, Bahraich 271902, Uttar Pradesh, India"**, support email, PAN and GSTIN empty. Changed in Admin when the company is formed. |
| Invoice number | `SAI/<FY>/<0001>`, e.g. `SAI/2026-27/0001`; Indian financial year (Apr–Mar); atomic counter per FY. Old invoices keep their numbers. |
| Snapshot | Seller and buyer details are copied onto each invoice at creation; later setting changes don't alter issued invoices. |
| Webhook | `POST /api/v1/payments/razorpay/webhook`, event `payment.captured`, HMAC-SHA256 of the raw body with `RAZORPAY_WEBHOOK_SECRET`. |
| Concurrency | A `payments` record keyed by the Razorpay payment id (unique) is claimed atomically; only the claimer activates. Others return the same result, never an error. |
| Stripe | Not loaded and not offered without a publishable key. |
| Website | "GST included" copy replaced; footer GSTIN placeholder removed. Final wording to be checked with a CA. |

## 1. Settings: seller details

- `appSettings` key `billingSeller`: `{ legalName, address, email, pan, gstin }`. Defaults as above (`email: support@geosignalai.com`).
- `GET/PUT /admin/billing-settings` (admin only, Joi: `legalName` 2–120, `address` 5–300, `email` valid, `pan` empty or `^[A-Z]{5}[0-9]{4}[A-Z]$`, `gstin` empty or the 15-character GSTIN pattern).
- Admin → Billing & Invoices gets a "Seller details" form. A non-empty GSTIN shows a note "GST invoices are not built yet; invoices stay without GST" (so setting it can't silently produce wrong tax documents).

## 2. Payments and activation (concurrency)

New collection `payments`:

| Field | Meaning |
|---|---|
| `paymentId` (unique) | Razorpay payment id |
| `orderId` | Razorpay order id |
| `orgId`, `userId`, `plan`, `billingCycle`, `amount` | from the order notes / order amount (never from the client) |
| `status` | `processing` → `done` |
| `invoiceId` | set when done |
| `source` | `browser` or `webhook` (first claimer) |
| `claimedAt`, `doneAt` | timing |

`activatePayment({ paymentId, orderId, source })` — the single entry point for both the browser confirm and the webhook:
1. Fetch the order from Razorpay (`orders.fetch(orderId)`): notes give plan, cycle, org, user; amount in paise must equal the plan price. Payment must be `captured` (or `authorized` with auto-capture on — the webhook only sends captured).
2. **Claim:** `payments.insertOne({ paymentId, status: 'processing', ... })`.
   - Duplicate key → someone else has it: wait for `status: 'done'` (poll the record up to 10 s), then return its subscription and invoice. If still `processing` after 10 s and `claimedAt` is older than 2 min, take it over (`findOneAndUpdate({ paymentId, status: 'processing', claimedAt: { $lt: now-2min } }, { claimedAt: now })`) and continue — this finishes a claim whose process died.
3. Extend the subscription (same rules as today: early renewal extends from the current end) and create the invoice (§3), then set `status: 'done', invoiceId`.
4. Send the invoice email with the PDF (§4); a mail failure is logged, never undoes the activation.

The existing `InvoiceModel.exists` check is removed (the claim replaces it). A unique sparse index on `invoices.gatewayPaymentId` is added as a second guard.

**Browser confirm** (`POST /subscription/confirm`): verifies the Razorpay signature as today, then `activatePayment(..., 'browser')`; responds with the plan and invoice.

**Webhook** (`POST /api/v1/payments/razorpay/webhook`, no auth):
- Mounted in `app.ts` with `express.raw({ type: 'application/json' })` before `express.json()` and before the API router (so neither the JSON parser nor the per-IP rate limiter touches it); the signature is computed on the exact bytes.
- Verifies `X-Razorpay-Signature` = HMAC-SHA256(rawBody, `RAZORPAY_WEBHOOK_SECRET`) with `timingSafeEqual`; bad or missing → 400, nothing done.
- `payment.captured` → `activatePayment(payment.id, payment.order_id, 'webhook')`; other events → 200 ignored.
- Always answers 200 quickly once the signature is valid (Razorpay retries non-2xx); work errors are logged and the next retry or browser confirm finishes the claim.
- No `RAZORPAY_WEBHOOK_SECRET` → the route answers 503 and logs a warning (staging/prod must set it).

**Checkout reuse** (`POST /subscription/checkout`): if the org has a Razorpay order created in the last 15 minutes for the same plan and cycle and not yet paid, return that order instead of creating a new one. Orders are kept in a small `checkoutOrders` collection `{ orgId, plan, billingCycle, orderId, amount, createdAt }` (TTL 1 day); a paid order (its id in `payments`) is never reused. Two tabs or a double click give one order.

## 3. Invoice

- Number from `counters` collection: `findOneAndUpdate({ _id: 'invoice:2026-27' }, { $inc: { seq: 1 } }, { upsert: true, new: true })` → `SAI/2026-27/0001`. FY from the payment date in IST (April starts a new FY).
- New invoice fields: `seller` (snapshot of `billingSeller`), `buyer` `{ name, email, orgName }`, `period` `{ start, end }`, `gatewayOrderId`, `taxNote: 'GST not charged: supplier is not registered under GST.'` (only when `seller.gstin` is empty).
- `GET /subscription/invoices/:id/pdf` (org members only; invoice must belong to the caller's org; 404 otherwise) → PDF rendered with the existing Puppeteer `withBrowser` (max 2 Chrome, same as reports). Filename `Invoice-SAI-2026-27-0001.pdf`.
- PDF layout: "INVOICE" (never "Tax Invoice" without a GSTIN), seller block, "Billed to" block, number and dates, one line item (`Signal AI <Plan> plan (<monthly|yearly>), <period>`), total ₹, "Paid via UPI/Card (Razorpay), payment <id>", the tax note, and "Questions? support@geosignalai.com".
- Old invoices (before this change) still list and download; missing snapshot fields fall back to the current seller setting with "(details at download time)".

## 4. Invoice email

After activation: subject "Your Signal AI invoice SAI/2026-27/0001", the account-email layout (intro, amount, plan, period, "Download invoice" button to the app's Billing page), PDF attached. Sent to the paying user.

## 5. Billing page (UX)

- "Pay" disables itself and shows "Opening payment…" until the popup opens; a second click does nothing.
- After the popup's success handler: "Confirming your payment…". Confirm succeeds → "Your <Plan> plan is active" and the invoice appears.
- Confirm fails or times out (network, tab issues): poll `GET /subscription` every 3 s for up to 60 s; when the plan is active, show success. Still not active: "Payment received (ID pay_…). We're activating your plan; this can take a few minutes and we'll email your invoice."
- Popup dismissed without paying → button resets, no message.
- Invoice list gets a "Download PDF" link per invoice; the print modal stays for old invoices.
- `loadStripe` only when `VITE_STRIPE_PUBLISHABLE_KEY` is set; no Stripe option otherwise.

## 6. Website and terms

- Pricing cards: "Billed monthly, GST included" → "Billed monthly in ₹".
- Pricing FAQ "Are prices inclusive of GST?" → "Do you charge GST? Not at the moment: we are not GST-registered yet, so the price you see is the price you pay."
- Terms: "Prices are in Indian rupees and include GST." → "Prices are in Indian rupees. We are not registered under GST, so no GST is charged."
- Pricing page meta description: drop "GST included".
- Footer: remove the `GSTIN [GSTIN]` line; `site.ts` company: legal name and address as in §1 (display), GSTIN removed.

## 7. Errors

| Case | Result |
|---|---|
| Webhook signature bad/missing | 400, nothing changes |
| Webhook secret not configured | 503 + warning log |
| Order amount ≠ plan price, or notes missing | activation refused, payment record `failed` with reason, admin log (money refunded manually) |
| Same payment twice (any mix of browser/webhook) | one invoice, one extension; second caller gets the first result |
| Claimer crashed mid-way | after 2 min the next caller takes over and finishes |
| PDF render fails | 503 "Invoice PDF is not available right now", invoice data unaffected |
| Invoice email fails | logged; plan and invoice stand |

## 8. Testing

- `backend/src/checks/billing.check.ts` (local Mongo, Razorpay client faked): FY and invoice number sequence (incl. 20 parallel numbers all unique, FY rollover on 1 April IST); webhook signature (valid, tampered body, missing header, no secret); `activatePayment` called 10 times in parallel for one payment → 1 invoice, period extended once, all callers get the same invoice; stale `processing` taken over; amount mismatch refused; checkout reuse within 15 min, new order after; invoice snapshot unchanged after a settings edit; PDF route org check (other org → 404); seller settings validation.
- Existing checks stay green.
- Staging (Razorpay test mode): UPI `success@razorpay`; close the tab after paying (webhook path); double-click Pay; Test Sheet **N14**; tester agent; then production with live keys on the user's go-ahead.
- User tasks before staging: Razorpay Dashboard (test mode) → Webhooks → URL `https://app.staging.geosignalai.com/api/v1/payments/razorpay/webhook`, event `payment.captured`, a secret → staging `.env` `RAZORPAY_WEBHOOK_SECRET` (no prefix) and recreate api/worker.

## Non-goals (later)

GST tax invoices (CGST/SGST/IGST, SAC, buyer GSTIN), credit notes and refunds through the app, Stripe/international checkout, subscriptions with auto-debit (UPI AutoPay), invoice editing.
