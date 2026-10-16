# Fix guide: who does it, how, and "Send to developer"

*Date: 17 Oct 2026. Status: approved in chat, waiting for spec review.*

## Why

Signal AI's users are Indian D2C / Shopify founders who don't know SEO, let alone GEO. They understand the
problem ("AI recommends Ajmal, not you") but stall on the fix: half the tasks need a developer (schema,
robots.txt, llms.txt, JavaScript-rendered content) and the rest need to know where to click in Shopify.
A task the founder can neither do nor hand off is a churn reason.

**Goal:** no task is a dead end. For every task the founder sees who usually does it, plain steps for their
store, and can send it to their developer in one click (or copy it for WhatsApp).

**Success:** every recommendation, audit fix tip and generated fix has a "who" tag, steps, *Send to
developer* and *Copy text*; the share of recommendations marked done goes up.

## Decisions (from the chat)

- Scope: Recommendations page, audit fix tips (store audit, AI crawler view, product feed health) and the
  Fixes page.
- All product text in simple English. Hinglish only in buyer queries (and in a fix the user asked to write in
  Hinglish).
- Steps come from a fixed library written by us (approach A), never from an AI. An unknown task falls back to
  a generic "Needs a developer" guide.
- *Send to developer* and *Copy text* on **every** task, including ones the founder can do. "You can do this"
  / "Needs a developer" is a hint, not a gate.
- Developer email saved once per brand; email is sent from our mail setup with Reply-To = founder and the
  founder in CC. *Copy text* for WhatsApp.

## 1. The fix library (`backend/src/service/fixGuide.ts`)

One record per kind:

```ts
type FixKind = 'crawler-access' | 'llms-txt' | 'product-schema' | 'faq-schema' | 'rating-schema'
  | 'js-content' | 'collection-schema' | 'reviews' | 'description' | 'alt-text' | 'title-meta'
  | 'price-stock' | 'product-ids' | 'images' | 'faq-page' | 'comparison-page' | 'marketplace' | 'outreach'
  | 'forums' | 'other'

interface IFixGuide {
  kind: FixKind
  who: 'you' | 'developer'        // hint shown as "You can do this" / "Needs a developer"
  title: string                   // short task name for the email subject, e.g. "Add FAQPage schema"
  steps: { shopify: string[]; other: string[] }   // 3-6 short lines each, simple English
  forDeveloper: string            // technical note: what, where, how to check it worked
}
export const FIX_GUIDES: Record<FixKind, IFixGuide>
export const guideFor = (kind: string | undefined): IFixGuide   // unknown or empty → FIX_GUIDES.other
export const kindFromText = (text: string): FixKind             // keyword match for old saved recommendations
```

| who = `you` | who = `developer` |
|---|---|
| reviews, description, alt-text, title-meta, price-stock, product-ids, images, faq-page, comparison-page, marketplace, outreach, forums | crawler-access, llms-txt, product-schema, faq-schema, rating-schema, js-content, collection-schema, other |

The Shopify lines now in `storeAuditService.TIPS[key].shopify`, `COLLECTION_TIPS` and
`aiViewService.FIX_TIPS[key].shopify` move into the library's `steps.shopify`, so there is one source.
The one-line `tip` in those panels stays as it is (it says what is wrong); the guide says how to fix it.

### Where each task gets its kind

- **AI recommendations** (`recommendationService.generateRecommendations`): the prompt lists the kinds and the
  model returns `"kind"`. A missing or unknown kind is `other`.
- **Built-in recommendations** (`databseService.buildRecommendations`): a fixed kind on each
  (robots → crawler-access, llms.txt → llms-txt, FAQPage → faq-schema, vs page → comparison-page,
  reviews → reviews, subreddits → forums).
- **Saved recommendations without a kind:** `kindFromText(text)` at read time (robots/crawler/GPTBot →
  crawler-access, llms.txt → llms-txt, FAQ + schema → faq-schema, FAQ → faq-page, "vs" / comparison →
  comparison-page, review → reviews, Amazon/Flipkart/Nykaa/marketplace → marketplace, reddit/forum → forums,
  blog/outreach/PR → outreach, alt text → alt-text, description → description, schema → product-schema,
  else other). No migration.
- **Store audit checks:** schema → product-schema, price → price-stock, reviews → rating-schema,
  description → description, faq → faq-schema, alt → alt-text, meta → title-meta;
  collection schema → collection-schema, collection description → description, collection meta → title-meta.
- **AI crawler view facts:** name, price, rating, description → js-content; schema → product-schema.
- **Feed health checks:** see "Feed health mapping" below.
- **Fixes page:** FAQ fix → faq-page (the schema part is noted for the developer); comparison fix →
  comparison-page.

### Feed health mapping (resolved)

Feed checks map as: description → description, title → title-meta, brand → product-ids, gtin → product-ids,
price → price-stock, stock → price-stock, category → product-ids, image / images → `images`
(who: you; Shopify: Products → open the product → Media → add a clear JPG or PNG, 3+ photos).

### Is the store Shopify?

`isShopify` is true when the latest website audit's homepage HTML matches `aiViewService.isShopifyHtml` (saved
on the audit as `isShopify: boolean`) or any saved product has a `shopifyId`. The API returns `isShopify` with
the guides; the UI shows `steps.shopify` when true, else `steps.other`.

## 2. API

- Recommendations (`GET /brands/:id/recommendations`): each item gains `kind`. The response gains
  `isShopify`, `developerEmail` and `guides` (the `IFixGuide` records the items use, keyed by kind) so the page
  needs no second call.
- Store audit, AI view and feed health responses: each failing check gains `kind`; the brand's `isShopify`,
  `developerEmail` and `guides` come once with the response (same shape).
- Fixes (`GET /brands/:id/fixes`, one fix): `kind` per fix; same `isShopify` / `developerEmail` / `guides`.
- `POST /brands/:id/send-to-developer`
  - body: `{ task: { type: 'recommendation', id } | { type: 'store-audit' | 'ai-view' | 'feed', key, url? } |
    { type: 'fix', id }, developerEmail?: string }`
  - `developerEmail` given → validated (format, not disposable via `isDisposableEmail`), saved on the brand,
    then used. Not given → the brand's saved one; none saved → 422 "Add your developer's email first."
  - The server builds the email from the library and the task's own saved data (recommendation text and
    snippet, the audited page URL, the fix's HTML / FAQ schema). Text from the browser is never put in the
    email, so the button can't send arbitrary mail.
  - Limit: 20 sends per brand per day (IST), counted like the other daily quotas; over it → 429 "You can send
    20 tasks a day. Try again tomorrow, or use Copy text." A failed send is not counted (refunded).
  - Logs each send in a small `developerSends` collection `{ brandId, userId, to, taskType, taskRef, kind,
    sentAt }`, TTL 90 days. The task's last send comes back with it as `lastSentTo` / `lastSentAt`.
  - 200 `{ sentTo, sentAt }`; mail provider failure → 502 "Couldn't send. Use Copy text instead."
- `PATCH /brands/:id` accepts `developerEmail` ('' clears it), same validation.

## 3. The email

Layout from `emailTemplates.layout` (like the account emails), simple English:

- Subject: `<Brand>: <guide.title>` (e.g. "Hasan Oud: Add FAQPage schema to product pages")
- Body: what and why (the recommendation text, or the audit check and page), the page link if any,
  the steps for the store's platform, "For the developer" note, and the code block if the task has one
  (recommendation snippet, FAQ schema, comparison HTML).
- Footer: "Sent by <founder name> from Signal AI. Reply to this email to reach them."
- Headers: Reply-To = founder's email; CC = founder. Plain-text part with the same content.

## 4. UI

One component `frontend/src/components/FixGuide.tsx` used in all places:

- Tag: green **You can do this** / amber **Needs a developer**.
- **How to do it** toggles the steps (Shopify or other) inside the card.
- **Send to developer**: sends; then "Sent to dev@x.com" (and "Sent 2 days ago" from `lastSentAt`). With no
  saved email it opens an inline "Your developer's email" box with **Save and send**.
- **Copy text**: builds plain text in the browser (task, steps, developer note, code) and copies it;
  "Copied" for 2 s.
- Recommendations page header line: "6 tasks: 3 you can do, 3 need a developer".
- Fixes page: under a generated fix, "How to add this to your store" + the two buttons.
- Audit panels: under each failing check's existing tip, the tag + the three buttons (compact).
- Settings → Brand: "Developer email" field (save / clear), same validation message as the API.

Phone width (390 px): buttons wrap, steps stay inside the card, no sideways scroll.

## 5. Errors and edge cases

- Unknown or missing kind → `other` guide ("Needs a developer", generic steps, developer note: "Details are
  in the task above").
- Task id that is not this brand's → 404 (scoped like the other brand routes).
- Developer email equals the founder's own email → allowed (some founders are their own developer).
- No mail provider configured (local dev) → same behaviour as other emails (logged, not sent), the API still
  returns 200 so the flow can be tried locally; staging uses Mailpit.

## 6. Testing

- `fixGuide.check.ts`: every kind has who, title, 3-6 steps for both platforms, a developer note, no
  Hinglish markers in any text; `guideFor` fallback; `kindFromText` on the built-in texts and a set of real
  saved AI recommendation texts; every store audit / AI view / feed key maps to a kind.
- `sendToDeveloper.check.ts` (local DB, email stubbed): saves and validates the email, 422 without one,
  disposable refused, 20/day limit and refund on failure, 404 on another brand's task, email has Reply-To,
  CC, subject and the library steps, and no text from the request body.
- Staging: Mailpit shows the email; Playwright through the three surfaces at desktop and 390 px; Test Sheet
  feature + positive / negative cases.

## Out of scope

- AI-written steps (approach C fallback), one-click fixes in the store (Shopify app, #6), WhatsApp sending
  (only Copy text), a task board for developers, translations.
