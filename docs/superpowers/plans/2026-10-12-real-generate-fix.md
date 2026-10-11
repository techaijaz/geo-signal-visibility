# Real "Generate fix" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On demand, write a FAQ (per product kind or whole brand) or a "Brand vs Competitor" page from the brand's real pages, with sources and `[confirm]` marks, under a monthly per-plan limit.

**Architecture:** API creates a `generatedFix` doc (`pending`) under a per-org lock after a monthly usage count, then enqueues a `fix-generation` BullMQ job. The worker picks pages (by product kind / Lost-to), fetches them SSRF-safe, calls a strong model with strict no-invention rules, validates sources, and saves items. Frontend polls, shows editable items and copy buttons (text / HTML / FAQ JSON-LD built by a backend helper and returned with the doc).

**Tech Stack:** Node + Express + Mongoose + BullMQ (backend, TypeScript), cheerio, React + Vite (frontend), checks as `ts-node` scripts with `assert`.

**Spec:** `docs/superpowers/specs/2026-10-12-real-generate-fix-design.md`

## Global Constraints

- Limits per org per IST calendar month: free 1, starter 10, growth 30, agency 150 (`maxFixGenerations`). Admin users count as agency (same rule as products/citations).
- Only `status: 'done'` counts; `pending` younger than 5 minutes also counts (blocks parallel clicks); older `pending` is treated as failed.
- Languages: `'en' | 'hi-en' | 'hi'`, default `'en'`.
- Pages: one kind → 3-5 products of that kind; whole brand → 1-2 per kind, max 8, plus homepage; comparison → up to 4 own products of the kinds in queries the competitor won, plus up to 3 competitor pages; no saved products → homepage + product links on it.
- Page text trimmed to ~1,500 words each; fetch timeout 10 s via `fetchPublicText`.
- AI: Claude (config `FIX_MODEL_CLAUDE`, default `claude-sonnet-5-5`) first, then OpenAI (`FIX_MODEL_OPENAI`, default `gpt-4o`); cost logged with purpose `'fix'`.
- Prompt rules: only given text; JSON only; every item cites a source URL from the list; unknown facts as `[confirm: …]`; no negative claims about competitors; write in the chosen language.
- Any item whose source isn't one of the pages read becomes `[confirm: source not found]`.
- Over-limit message: `You've used all <n> generations this month. They reset on <1 Mon>.`
- No Claude attribution in commits; commit header ≤ 100 chars (commitlint).
- Checks run with SMTP blanked: `export SMTP_HOST= SMTP_USER= SMTP_PASS= NODE_ENV=development`.

## Review Focus

- A brand whose saved products have no detectable kind (all "Other") → "Whole brand" and "Other" still work; no empty kind list crash.
- The competitor has no website and its name isn't in any won query → comparison still generates from own pages + stored AI answers, competitor facts as `[confirm]`.
- AI returns JSON wrapped in prose or ```json fences → parsed, not failed.
- Two tabs click Generate at once on the last remaining generation → exactly one is created, the other gets the limit message.
- Month edge: a fix finished 23:59 IST on the 31st counts for that month, not the next.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/src/config/planLimits.ts` (modify) | `maxFixGenerations` per plan |
| `backend/src/config/config.ts` (modify) | `FIX_MODEL_CLAUDE`, `FIX_MODEL_OPENAI` |
| `backend/src/model/generatedFixModel.ts` (create) | Mongoose model |
| `backend/src/types/fixTypes.ts` (create) | Shared types |
| `backend/src/service/fix/usage.ts` (create) | IST month, usage count, reset label |
| `backend/src/service/fix/pickPages.ts` (create) | Kinds, page choice (pure) |
| `backend/src/service/fix/readPages.ts` (create) | Fetch + extract page text |
| `backend/src/service/fix/prompt.ts` (create) | Prompt builder + response parser/validator |
| `backend/src/service/fix/output.ts` (create) | Text / HTML / FAQ JSON-LD from items |
| `backend/src/service/fix/runFix.ts` (create) | Worker job: pick → read → AI → save |
| `backend/src/service/fix/createFix.ts` (create) | Limit check + lock + create + enqueue |
| `backend/src/service/costLogService.ts` (modify) | purpose `'fix'` |
| `backend/src/service/queueService.ts` (modify) | `fixQueue`, `enqueueFixJob` |
| `backend/src/service/workerService.ts` (modify) | fix worker |
| `backend/src/controller/fixController.ts` (create) | HTTP handlers |
| `backend/src/router/apiRouter.ts` (modify) | routes |
| `backend/src/checks/generatedFix.check.ts` (create) | All backend checks |
| `frontend/src/pages/Fixes.tsx` (create) | Fixes page: generate panel, list, editor |
| `frontend/src/router.tsx`, `components/AppLayout.tsx` (modify) | route + nav |
| `frontend/src/pages/Recommendations.tsx` (modify) | FAQ/comparison recs link to Fixes |

Deviation from spec, on purpose: HTML and JSON-LD are built in the backend (`output.ts`) so the check can test them; the frontend only displays/copies.

---

### Task 1: Limits, model, types, usage count

**Files:**
- Modify: `backend/src/config/planLimits.ts`, `backend/src/config/config.ts`
- Create: `backend/src/types/fixTypes.ts`, `backend/src/model/generatedFixModel.ts`, `backend/src/service/fix/usage.ts`
- Test: `backend/src/checks/generatedFix.check.ts`

**Interfaces:**
- Produces: `PLAN_LIMITS[plan].maxFixGenerations: number`; `IGeneratedFix`, `IFixItem`, `FixType`, `FixLanguage` types; `generatedFixModel`; `istMonthStart(now: Date): Date`, `nextResetLabel(now: Date): string` (e.g. `'1 Nov'`), `countFixUsage(orgId: string, now?: Date): Promise<number>`, `STALE_PENDING_MS = 5 * 60 * 1000`.

- [ ] **Step 1: Write the failing check**

`backend/src/checks/generatedFix.check.ts`:
```ts
/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/generatedFix.check.ts (needs the local Mongo)
import assert from 'assert'
import mongoose from 'mongoose'
import { PLAN_LIMITS } from '../config/planLimits'
import generatedFixModel from '../model/generatedFixModel'
import { istMonthStart, nextResetLabel, countFixUsage } from '../service/fix/usage'

const run = async () => {
    await mongoose.connect('mongodb://127.0.0.1:27017/signal_fix_check')
    await mongoose.connection.dropDatabase()

    // Limits
    assert.deepEqual(
        [PLAN_LIMITS.free.maxFixGenerations, PLAN_LIMITS.starter.maxFixGenerations, PLAN_LIMITS.growth.maxFixGenerations, PLAN_LIMITS.agency.maxFixGenerations],
        [1, 10, 30, 150]
    )

    // IST month: 31 Oct 23:59 IST is October, 1 Nov 00:00 IST is November
    assert.equal(istMonthStart(new Date('2026-10-31T18:29:00Z')).toISOString(), '2026-09-30T18:30:00.000Z')
    assert.equal(istMonthStart(new Date('2026-10-31T18:30:00Z')).toISOString(), '2026-10-31T18:30:00.000Z')
    assert.equal(nextResetLabel(new Date('2026-10-12T10:00:00Z')), '1 Nov')
    assert.equal(nextResetLabel(new Date('2026-12-20T10:00:00Z')), '1 Jan')

    // Usage: done counts, failed doesn't, fresh pending counts, stale pending doesn't, last month doesn't
    const orgId = new mongoose.Types.ObjectId()
    const now = new Date('2026-10-12T10:00:00Z')
    const base = { orgId, brandId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), type: 'faq', language: 'en' }
    await generatedFixModel.create([
        { ...base, status: 'done', createdAt: new Date('2026-10-02T00:00:00Z') },
        { ...base, status: 'failed', createdAt: new Date('2026-10-03T00:00:00Z') },
        { ...base, status: 'pending', createdAt: new Date(now.getTime() - 60_000) },
        { ...base, status: 'pending', createdAt: new Date(now.getTime() - 10 * 60_000) },
        { ...base, status: 'done', createdAt: new Date('2026-09-30T18:29:00Z') } // 23:59 IST 30 Sep
    ])
    assert.equal(await countFixUsage(String(orgId), now), 2)

    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
    console.log('generated fix checks passed')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd backend && export SMTP_HOST= SMTP_USER= SMTP_PASS= NODE_ENV=development && npx ts-node --transpile-only src/checks/generatedFix.check.ts`
Expected: FAIL, `Cannot find module '../model/generatedFixModel'`.

- [ ] **Step 3: Implement**

`planLimits.ts`: add to each plan object `maxFixGenerations: 1` (free), `10` (starter), `30` (growth), `150` (agency), next to `maxProducts`.

`config.ts`, next to `AI_MODELS`:
```ts
    // "Generate fix" (FAQ / comparison) needs a strong writer; both need a price on the AI Models page
    FIX_MODEL_CLAUDE: process.env.FIX_MODEL_CLAUDE || 'claude-sonnet-5-5',
    FIX_MODEL_OPENAI: process.env.FIX_MODEL_OPENAI || 'gpt-4o',
```

`types/fixTypes.ts`:
```ts
export type FixType = 'faq' | 'comparison'
export type FixLanguage = 'en' | 'hi-en' | 'hi'
export type FixStatus = 'pending' | 'done' | 'failed'

// FAQ items use question/answer; comparison items use heading/body, and the difference table uses rows
export interface IFixItem {
    question?: string
    answer?: string
    heading?: string
    body?: string
    rows?: Array<{ label: string; brand: string; competitor: string }>
    source?: string
}

export interface IGeneratedFix {
    _id: unknown
    orgId: unknown
    brandId: unknown
    userId: unknown
    type: FixType
    kind?: string | null
    competitor?: string | null
    language: FixLanguage
    status: FixStatus
    error?: string | null
    note?: string | null
    title?: string | null
    pagesRead: Array<{ url: string; ok: boolean }>
    items: IFixItem[]
    createdAt: Date
    finishedAt?: Date | null
}
```

`model/generatedFixModel.ts`:
```ts
import mongoose from 'mongoose'
import { IGeneratedFix } from '../types/fixTypes'

const itemSchema = new mongoose.Schema(
    {
        question: String,
        answer: String,
        heading: String,
        body: String,
        rows: [{ _id: false, label: String, brand: String, competitor: String }],
        source: String
    },
    { _id: false }
)

const generatedFixSchema = new mongoose.Schema(
    {
        orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Org', required: true },
        brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        type: { type: String, enum: ['faq', 'comparison'], required: true },
        kind: { type: String, default: null },
        competitor: { type: String, default: null },
        language: { type: String, enum: ['en', 'hi-en', 'hi'], default: 'en' },
        status: { type: String, enum: ['pending', 'done', 'failed'], default: 'pending' },
        error: { type: String, default: null },
        note: { type: String, default: null },
        title: { type: String, default: null },
        pagesRead: [{ _id: false, url: String, ok: Boolean }],
        items: { type: [itemSchema], default: [] },
        createdAt: { type: Date, default: Date.now },
        finishedAt: { type: Date, default: null }
    },
    { versionKey: false }
)
// Monthly usage is counted per org by creation time
generatedFixSchema.index({ orgId: 1, createdAt: -1 })

export default mongoose.model<IGeneratedFix>('GeneratedFix', generatedFixSchema)
```

`service/fix/usage.ts`:
```ts
import mongoose from 'mongoose'
import generatedFixModel from '../../model/generatedFixModel'

const IST_MS = 5.5 * 60 * 60 * 1000
export const STALE_PENDING_MS = 5 * 60 * 1000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Start of the IST calendar month that `now` falls in, as a UTC instant
export const istMonthStart = (now: Date) => {
    const ist = new Date(now.getTime() + IST_MS)
    return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_MS)
}

// "1 Nov": when this month's generations reset
export const nextResetLabel = (now: Date) => {
    const ist = new Date(now.getTime() + IST_MS)
    return `1 ${MONTHS[(ist.getUTCMonth() + 1) % 12]}`
}

// Finished generations this month, plus ones still running (so parallel clicks can't pass the limit).
// Failed ones and pending ones stuck over 5 minutes don't count
export const countFixUsage = (orgId: string, now = new Date()) =>
    generatedFixModel.countDocuments({
        orgId: new mongoose.Types.ObjectId(orgId),
        createdAt: { $gte: istMonthStart(now) },
        $or: [{ status: 'done' }, { status: 'pending', createdAt: { $gte: new Date(now.getTime() - STALE_PENDING_MS) } }]
    })
```

- [ ] **Step 4: Run, expect pass**

Run: same command as Step 2. Expected: `generated fix checks passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/config backend/src/types/fixTypes.ts backend/src/model/generatedFixModel.ts backend/src/service/fix/usage.ts backend/src/checks/generatedFix.check.ts
git commit -m "feat(fix): generated fix model, plan limits and monthly usage count"
```

---

### Task 2: Choosing pages

**Files:**
- Create: `backend/src/service/fix/pickPages.ts`
- Test: `backend/src/checks/generatedFix.check.ts` (add a block before the Mongo part)

**Interfaces:**
- Consumes: `productKind(title, productType)` from `service/productKinds.ts` (returns `{ kind } | null`); `brandKey(name)` from `service/competitorService.ts`; `IBrandProduct`; `ILostTo['byQuestion']`.
- Produces: `OTHER_KIND = 'Other'`; `kindsOf(products: IBrandProduct[]): Array<{ kind: string; count: number }>`; `pickOwnUrls(input: { type: FixType; kind?: string | null; competitor?: string | null; products: IBrandProduct[]; byQuestion?: ILostTo['byQuestion'] }): string[]`; `wonQueries(byQuestion, competitor): string[]`.

- [ ] **Step 1: Add failing checks**

```ts
import { kindsOf, pickOwnUrls, wonQueries, OTHER_KIND } from '../service/fix/pickPages'
// ...inside run(), before mongoose.connect:
    const p = (title: string, url: string) => ({ shopifyId: null, title, shortName: title, aliases: [], url, price: null, image: '', productType: '', nameEditedByUser: false })
    const products = [
        p('Silk Oud Attar 12ml', 'https://s.in/a1'), p('Black Oud Attar', 'https://s.in/a2'), p('Musk Attar', 'https://s.in/a3'),
        p('Rose Attar', 'https://s.in/a4'), p('Amber Attar', 'https://s.in/a5'), p('Mukhallat Attar', 'https://s.in/a6'),
        p('Royal Bakhoor', 'https://s.in/b1'), p('Gift Box', 'https://s.in/g1')
    ]
    assert.deepEqual(kindsOf(products), [{ kind: 'attar', count: 6 }, { kind: 'bakhoor', count: 1 }, { kind: OTHER_KIND, count: 1 }])
    // One kind: up to 5 of that kind, in saved order
    assert.deepEqual(pickOwnUrls({ type: 'faq', kind: 'attar', products }), ['https://s.in/a1', 'https://s.in/a2', 'https://s.in/a3', 'https://s.in/a4', 'https://s.in/a5'])
    assert.deepEqual(pickOwnUrls({ type: 'faq', kind: OTHER_KIND, products }), ['https://s.in/g1'])
    // Whole brand: 2 per kind, max 8
    assert.deepEqual(pickOwnUrls({ type: 'faq', kind: null, products }), ['https://s.in/a1', 'https://s.in/a2', 'https://s.in/b1', 'https://s.in/g1'])
    // Comparison: kinds in the questions the competitor won, up to 4
    const byQuestion = [
        { queryText: 'best bakhoor for home', rows: [{ model: 'ChatGPT', you: null, others: [{ name: 'Ajmal', position: 1 }] }] },
        { queryText: 'best attar under 500', rows: [{ model: 'Gemini', you: 3, others: [{ name: 'Fogg', position: 1 }] }] }
    ]
    assert.deepEqual(wonQueries(byQuestion, 'ajmal'), ['best bakhoor for home'])
    assert.deepEqual(pickOwnUrls({ type: 'comparison', competitor: 'Ajmal', products, byQuestion }), ['https://s.in/b1'])
    // Competitor that won nothing we can map to a kind: whole-brand pick, capped at 4
    assert.equal(pickOwnUrls({ type: 'comparison', competitor: 'Nobody', products, byQuestion }).length, 4)
    // No saved products: nothing here (the runner falls back to homepage links)
    assert.deepEqual(pickOwnUrls({ type: 'faq', kind: 'attar', products: [] }), [])
```

- [ ] **Step 2: Run, expect failure** (`Cannot find module '../service/fix/pickPages'`).

- [ ] **Step 3: Implement `service/fix/pickPages.ts`**

```ts
import { productKind } from '../productKinds'
import { brandKey } from '../competitorService'
import type { IBrandProduct } from '../../types/brandTypes'
import type { ILostTo } from '../competitorService'
import type { FixType } from '../../types/fixTypes'

export const OTHER_KIND = 'Other'
const PER_KIND = 5
const WHOLE_PER_KIND = 2
const WHOLE_MAX = 8
const COMPARE_MAX = 4

const kindOf = (p: IBrandProduct) => productKind(p.title, p.productType)?.kind ?? OTHER_KIND
const withUrl = (products: IBrandProduct[]) => products.filter((p) => p.url)

// Saved products grouped by kind, biggest first; "Other" last
export const kindsOf = (products: IBrandProduct[]) => {
    const counts = new Map<string, number>()
    for (const p of withUrl(products)) counts.set(kindOf(p), (counts.get(kindOf(p)) ?? 0) + 1)
    return [...counts.entries()]
        .map(([kind, count]) => ({ kind, count }))
        .sort((a, b) => (a.kind === OTHER_KIND ? 1 : b.kind === OTHER_KIND ? -1 : b.count - a.count))
}

const wholeBrand = (products: IBrandProduct[], max: number) => {
    const urls: string[] = []
    for (const { kind } of kindsOf(products)) {
        urls.push(...withUrl(products).filter((p) => kindOf(p) === kind).slice(0, WHOLE_PER_KIND).map((p) => p.url))
    }
    return urls.slice(0, max)
}

// Questions where the AI named this competitor
export const wonQueries = (byQuestion: ILostTo['byQuestion'], competitor: string) => {
    const key = brandKey(competitor)
    return byQuestion.filter((q) => q.rows.some((r) => r.others.some((o) => brandKey(o.name) === key))).map((q) => q.queryText)
}

// Our own product pages to read for this fix
export const pickOwnUrls = (input: {
    type: FixType
    kind?: string | null
    competitor?: string | null
    products: IBrandProduct[]
    byQuestion?: ILostTo['byQuestion']
}): string[] => {
    const { products } = input
    if (input.type === 'comparison') {
        const kinds = new Set(
            wonQueries(input.byQuestion ?? [], input.competitor ?? '')
                .map((q) => productKind(q)?.kind)
                .filter(Boolean)
        )
        const matching = withUrl(products).filter((p) => kinds.has(kindOf(p)))
        return matching.length ? matching.slice(0, COMPARE_MAX).map((p) => p.url) : wholeBrand(products, COMPARE_MAX)
    }
    if (!input.kind) return wholeBrand(products, WHOLE_MAX)
    return withUrl(products)
        .filter((p) => kindOf(p) === input.kind)
        .slice(0, PER_KIND)
        .map((p) => p.url)
}
```

Note: `productKind` signature is `(title: string, productType = '')`; check it matches before running. If `ILostTo` isn't exported from `competitorService.ts`, export it (it is declared with `export interface`).

- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(fix): choose pages by product kind and lost-to questions"`

---

### Task 3: Reading pages

**Files:**
- Create: `backend/src/service/fix/readPages.ts`
- Test: `generatedFix.check.ts`

**Interfaces:**
- Consumes: `fetchPublicText(url, headers, timeout)` (`util/publicUrl.ts`), `extractPageFacts(html)` (`service/aiViewService.ts`), `productLinksIn(html, siteUrl)` (`service/auditService.ts`).
- Produces: `IPageText { url: string; title: string; price: string | null; rating: string | null; text: string }`; `pageText(url: string, html: string): IPageText`; `readPages(urls: string[], fetch?: (url: string) => Promise<string>): Promise<{ pages: IPageText[]; read: Array<{ url: string; ok: boolean }> }>`; `homepageLinks(home: string, fetch?, max = 5): Promise<string[]>` (homepage + product links on it).

- [ ] **Step 1: Failing checks**

```ts
import { pageText, readPages, homepageLinks } from '../service/fix/readPages'
// ...
    const html = `<html><head><title>Silk Oud</title></head><body><nav>Menu Cart</nav><main><h1>Silk Oud Attar</h1>
        <p>Alcohol-free attar. Lasts 10-12 hours.</p><p>₹799</p><p>4.6 out of 5 (120 reviews)</p></main><footer>© shop</footer></body></html>`
    const pt = pageText('https://s.in/a1', html)
    assert.equal(pt.title, 'Silk Oud Attar')
    assert.ok(pt.text.includes('Alcohol-free attar') && !pt.text.includes('Menu Cart'))
    assert.equal(pt.price, '₹799')
    // Long pages are cut at ~1,500 words
    assert.ok(pageText('u', `<main>${'word '.repeat(3000)}</main>`).text.split(' ').length <= 1500)
    // A page that fails is reported, others still read
    const fake = async (u: string) => (u.endsWith('bad') ? Promise.reject(new Error('timeout')) : html)
    const r = await readPages(['https://s.in/a1', 'https://s.in/bad'], fake)
    assert.equal(r.pages.length, 1)
    assert.deepEqual(r.read, [{ url: 'https://s.in/a1', ok: true }, { url: 'https://s.in/bad', ok: false }])
    // Homepage fallback: the homepage plus product links on it
    const home = `<a href="/products/silk-oud">x</a><a href="/products/musk">y</a><a href="/about">z</a>`
    assert.deepEqual(await homepageLinks('https://s.in', async () => home), ['https://s.in', 'https://s.in/products/silk-oud', 'https://s.in/products/musk'])
```

Before writing the expectation for `price`, check what `extractPageFacts` returns for "₹799" (`formatPrice`); use that exact string in the assertion.

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement `service/fix/readPages.ts`**

```ts
import * as cheerio from 'cheerio'
import { fetchPublicText } from '../../util/publicUrl'
import { extractPageFacts } from '../aiViewService'
import { productLinksIn } from '../auditService'

const MAX_WORDS = 1500
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; SignalAI/1.0; +https://geosignalai.com)' }

export interface IPageText {
    url: string
    title: string
    price: string | null
    rating: string | null
    text: string
}

const fetchPage = (url: string) => fetchPublicText(url, UA, 10000)

// The page's own content (not menu, cart or footer), cut to ~1,500 words, plus the facts we already parse
export const pageText = (url: string, html: string): IPageText => {
    const facts = extractPageFacts(html)
    const $ = cheerio.load(html)
    $('script, style, noscript, template, svg, header, nav, footer, aside, [role="dialog"]').remove()
    const main = $('main, [role="main"]').first()
    const words = (main.length ? main : $('body')).text().replace(/\s+/g, ' ').trim().split(' ')
    return {
        url,
        title: facts.name || $('title').text().trim() || url,
        price: facts.price,
        rating: facts.rating,
        text: words.slice(0, MAX_WORDS).join(' ')
    }
}

export const readPages = async (urls: string[], fetch: (url: string) => Promise<string> = fetchPage) => {
    const pages: IPageText[] = []
    const read: Array<{ url: string; ok: boolean }> = []
    for (const url of urls) {
        try {
            pages.push(pageText(url, await fetch(url)))
            read.push({ url, ok: true })
        } catch {
            read.push({ url, ok: false })
        }
    }
    return { pages, read }
}

// For brands with no saved products: the homepage and product links found on it
export const homepageLinks = async (home: string, fetch: (url: string) => Promise<string> = fetchPage, max = 5) => {
    const html = await fetch(home).catch(() => '')
    return [home, ...(html ? productLinksIn(html, home).slice(0, max - 1) : [])]
}
```

If `productLinksIn` filters links differently from the expectation (e.g. needs absolute URLs), adjust the check's expected list to its real output — don't change `productLinksIn`.

- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(fix): read product pages as clean text"`

---

### Task 4: Prompt and response parsing

**Files:**
- Create: `backend/src/service/fix/prompt.ts`
- Test: `generatedFix.check.ts`

**Interfaces:**
- Consumes: `IPageText`, `IFixItem`, `FixType`, `FixLanguage`.
- Produces: `buildFixPrompt(input: { type: FixType; brandName: string; competitor?: string | null; kind?: string | null; language: FixLanguage; questions: string[]; pages: IPageText[]; competitorPages?: IPageText[]; aiSaid?: string[] }): string`; `parseFixResponse(raw: string, type: FixType, allowedUrls: string[]): { title: string; items: IFixItem[] } | null`.

- [ ] **Step 1: Failing checks**

```ts
import { buildFixPrompt, parseFixResponse } from '../service/fix/prompt'
// ...
    const prompt = buildFixPrompt({ type: 'faq', brandName: 'Hasan Oud', kind: 'attar', language: 'hi-en', questions: ['500 ke andar accha attar'], pages: [pt] })
    assert.ok(prompt.includes('ONLY the page text') && prompt.includes('[confirm:') && prompt.includes('Hinglish'))
    assert.ok(prompt.includes('https://s.in/a1') && prompt.includes('500 ke andar accha attar'))
    const cmp = buildFixPrompt({ type: 'comparison', brandName: 'Hasan Oud', competitor: 'Ajmal', language: 'en', questions: [], pages: [pt], aiSaid: ['Ajmal is known for...'] })
    assert.ok(cmp.includes('Never say anything negative about Ajmal'))

    const allowed = ['https://s.in/a1']
    const raw = 'Here you go:\n```json\n{"title":"Attar FAQ","items":[' +
        '{"question":"Is it alcohol-free?","answer":"Yes.","source":"https://s.in/a1"},' +
        '{"question":"Delivery time?","answer":"2 days","source":"https://evil.com/x"},' +
        '{"question":"","answer":"x","source":"https://s.in/a1"}]}\n```'
    const parsed = parseFixResponse(raw, 'faq', allowed)!
    assert.equal(parsed.title, 'Attar FAQ')
    assert.equal(parsed.items.length, 2) // the empty question is dropped
    assert.equal(parsed.items[0].source, 'https://s.in/a1')
    assert.equal(parsed.items[1].answer, '[confirm: source not found] 2 days')
    assert.equal(parsed.items[1].source, undefined)
    assert.equal(parseFixResponse('not json at all', 'faq', allowed), null)
    assert.equal(parseFixResponse('{"title":"x","items":[]}', 'faq', allowed), null) // nothing usable
    const cmpParsed = parseFixResponse(
        '{"title":"Hasan Oud vs Ajmal","items":[{"heading":"Price","body":"..","source":"https://s.in/a1"},{"heading":"Differences","rows":[{"label":"Price","brand":"₹799","competitor":"[confirm: price]"}]}]}',
        'comparison',
        allowed
    )!
    assert.equal(cmpParsed.items.length, 2)
    assert.equal(cmpParsed.items[1].rows![0].brand, '₹799')
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement `service/fix/prompt.ts`**

```ts
import type { IPageText } from './readPages'
import type { FixLanguage, FixType, IFixItem } from '../../types/fixTypes'

const LANGUAGE: Record<FixLanguage, string> = {
    en: 'English',
    'hi-en': 'Hinglish (Hindi in Latin script, the way Indian shoppers type)',
    hi: 'Hindi in Devanagari script'
}

const pageBlock = (p: IPageText) =>
    `URL: ${p.url}\nTitle: ${p.title}${p.price ? `\nPrice: ${p.price}` : ''}${p.rating ? `\nRating: ${p.rating}` : ''}\nText: ${p.text}`

export const buildFixPrompt = (input: {
    type: FixType
    brandName: string
    competitor?: string | null
    kind?: string | null
    language: FixLanguage
    questions: string[]
    pages: IPageText[]
    competitorPages?: IPageText[]
    aiSaid?: string[]
}) => {
    const rules = [
        `Use ONLY the page text below. Never invent facts, prices, ingredients, delivery times or claims.`,
        `If a fact a shopper would want is not in the text, write it as [confirm: <what the owner must check>].`,
        `Every item has "source": one URL copied exactly from the pages below that supports it. If none supports it, leave "source" empty and use [confirm: ...].`,
        `Write in ${LANGUAGE[input.language]}. Keep brand and product names as they are.`,
        `Reply with JSON only, no other text.`
    ]
    const own = input.pages.map(pageBlock).join('\n\n---\n\n')
    if (input.type === 'faq') {
        return `You write FAQ content for ${input.brandName}'s website${input.kind ? ` about its ${input.kind} products` : ''}.
Rules:
- ${rules.join('\n- ')}
- Write 8 to 12 questions shoppers really ask. Prefer these buyer questions where the pages can answer them: ${input.questions.slice(0, 15).join(' | ') || 'none given'}.
- Answers 1 to 3 sentences.

JSON shape: {"title": string, "items": [{"question": string, "answer": string, "source": string}]}

PAGES:
${own}`
    }
    const theirs = (input.competitorPages ?? []).map(pageBlock).join('\n\n---\n\n')
    return `You write a fair comparison page "${input.brandName} vs ${input.competitor}" for ${input.brandName}'s website.
Rules:
- ${rules.join('\n- ')}
- Facts about ${input.competitor} only from ITS pages or the AI answers below. Never say anything negative about ${input.competitor}; describe differences neutrally.
- Sections: a short intro, a difference table, "When to choose ${input.brandName}", and 3 to 5 FAQ items as sections.

JSON shape: {"title": string, "items": [{"heading": string, "body": string, "source": string} | {"heading": "Differences", "rows": [{"label": string, "brand": string, "competitor": string}]}]}

${input.brandName.toUpperCase()} PAGES:
${own}

${String(input.competitor).toUpperCase()} PAGES:
${theirs || 'none could be read'}

WHAT AI ASSISTANTS SAID ABOUT ${String(input.competitor).toUpperCase()}:
${(input.aiSaid ?? []).slice(0, 5).join('\n') || 'nothing stored'}`
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const jsonIn = (raw: string): unknown => {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]
    const body = fenced ?? raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
    try {
        return JSON.parse(body)
    } catch {
        return null
    }
}

// The AI's JSON as items we can save; a source not among the pages read becomes a [confirm] mark
export const parseFixResponse = (raw: string, type: FixType, allowedUrls: string[]): { title: string; items: IFixItem[] } | null => {
    const data = jsonIn(raw) as { title?: unknown; items?: unknown } | null
    if (!data || !Array.isArray(data.items)) return null
    const allowed = new Set(allowedUrls)
    const items: IFixItem[] = []
    for (const it of data.items as Array<Record<string, unknown>>) {
        const source = str(it?.source)
        const ok = !source || allowed.has(source)
        const mark = (text: string) => (ok || text.startsWith('[confirm') ? text : `[confirm: source not found] ${text}`)
        if (type === 'faq') {
            const question = str(it?.question)
            const answer = str(it?.answer)
            if (!question || !answer) continue
            items.push({ question, answer: mark(answer), ...(ok && source ? { source } : {}) })
        } else if (Array.isArray(it?.rows)) {
            const rows = (it.rows as Array<Record<string, unknown>>)
                .map((r) => ({ label: str(r?.label), brand: str(r?.brand), competitor: str(r?.competitor) }))
                .filter((r) => r.label)
            if (rows.length) items.push({ heading: str(it.heading) || 'Differences', rows })
        } else {
            const heading = str(it?.heading)
            const body = str(it?.body)
            if (!heading || !body) continue
            items.push({ heading, body: mark(body), ...(ok && source ? { source } : {}) })
        }
    }
    return items.length ? { title: str(data.title) || (type === 'faq' ? 'FAQ' : 'Comparison'), items } : null
}
```

- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(fix): prompt with no-invention rules and source-checked parsing"`

---

### Task 5: Output (text, HTML, FAQ JSON-LD)

**Files:**
- Create: `backend/src/service/fix/output.ts`
- Test: `generatedFix.check.ts`

**Interfaces:**
- Consumes: `IGeneratedFix`, `IFixItem`.
- Produces: `fixOutputs(fix: Pick<IGeneratedFix, 'type' | 'title' | 'items'>): { text: string; html: string; jsonLd: string | null }` (jsonLd only for FAQ; items still holding `[confirm` are left out of JSON-LD).

- [ ] **Step 1: Failing checks**

```ts
import { fixOutputs } from '../service/fix/output'
// ...
    const faqOut = fixOutputs({
        type: 'faq',
        title: 'Attar FAQ',
        items: [
            { question: 'Is it alcohol-free?', answer: 'Yes <b>100%</b>.', source: 'https://s.in/a1' },
            { question: 'Delivery?', answer: '[confirm: delivery days]' }
        ]
    })
    assert.ok(faqOut.text.startsWith('Attar FAQ') && faqOut.text.includes('Q: Is it alcohol-free?'))
    assert.ok(faqOut.html.includes('<h3>Is it alcohol-free?</h3>') && faqOut.html.includes('Yes &lt;b&gt;100%&lt;/b&gt;.'))
    const ld = JSON.parse(faqOut.jsonLd!.replace(/^<script type="application\/ld\+json">|<\/script>$/g, ''))
    assert.equal(ld['@type'], 'FAQPage')
    assert.equal(ld.mainEntity.length, 1) // the [confirm] item is left out until the owner fills it
    assert.equal(ld.mainEntity[0].acceptedAnswer.text, 'Yes <b>100%</b>.')
    const cmpOut = fixOutputs({ type: 'comparison', title: 'A vs B', items: [{ heading: 'Differences', rows: [{ label: 'Price', brand: '₹799', competitor: '₹999' }] }] })
    assert.ok(cmpOut.html.includes('<table>') && cmpOut.html.includes('<td>₹799</td>') && cmpOut.jsonLd === null)
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement `service/fix/output.ts`**

```ts
import type { IGeneratedFix, IFixItem } from '../../types/fixTypes'

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const pending = (s?: string) => !!s && s.includes('[confirm')

const rowsText = (it: IFixItem) => (it.rows ?? []).map((r) => `${r.label}: ${r.brand} | ${r.competitor}`).join('\n')
const rowsHtml = (it: IFixItem) =>
    `<table>${(it.rows ?? []).map((r) => `<tr><th>${esc(r.label)}</th><td>${esc(r.brand)}</td><td>${esc(r.competitor)}</td></tr>`).join('')}</table>`

// Ready-to-paste forms of a saved fix; the FAQ schema skips answers the owner still has to confirm
export const fixOutputs = (fix: Pick<IGeneratedFix, 'type' | 'title' | 'items'>) => {
    const title = fix.title || ''
    if (fix.type === 'faq') {
        const text = [title, ...fix.items.map((i) => `Q: ${i.question}\nA: ${i.answer}`)].join('\n\n')
        const html = [`<h2>${esc(title)}</h2>`, ...fix.items.map((i) => `<h3>${esc(i.question)}</h3>\n<p>${esc(i.answer)}</p>`)].join('\n')
        const ready = fix.items.filter((i) => !pending(i.answer))
        const jsonLd = ready.length
            ? `<script type="application/ld+json">${JSON.stringify({
                  '@context': 'https://schema.org',
                  '@type': 'FAQPage',
                  mainEntity: ready.map((i) => ({ '@type': 'Question', name: i.question, acceptedAnswer: { '@type': 'Answer', text: i.answer } }))
              }).replace(/</g, '\\u003c')}</script>`
            : null
        return { text, html, jsonLd }
    }
    const text = [title, ...fix.items.map((i) => `${i.heading}\n${i.rows ? rowsText(i) : i.body}`)].join('\n\n')
    const html = [`<h2>${esc(title)}</h2>`, ...fix.items.map((i) => `<h3>${esc(i.heading)}</h3>\n${i.rows ? rowsHtml(i) : `<p>${esc(i.body)}</p>`}`)].join('\n')
    return { text, html, jsonLd: null }
}
```

Note: JSON-LD escapes `<` as `\u003c` so an answer can't close the script tag. The check parses after stripping the wrapper, and `JSON.parse` turns `\u003c` back into `<`, so `'Yes <b>100%</b>.'` holds.

- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(fix): text, html and faq schema outputs"`

---

### Task 6: The worker job

**Files:**
- Create: `backend/src/service/fix/runFix.ts`
- Modify: `backend/src/service/costLogService.ts` (add `'fix'` to `purpose` union)
- Test: `generatedFix.check.ts`

**Interfaces:**
- Consumes: everything above; `databseService.findBrandById` (check exact name in `databseService.ts`; use the existing brand-by-id finder), `loadScanPair`, `computeLostTo`, `withAiCallContext`, `aiService.callClaude(prompt, maxTokens, model)`, `aiService.callOpenAiCompatible('OpenAI', prompt, model, maxTokens)`, `config.FIX_MODEL_CLAUDE/OPENAI`.
- Produces: `runFix(fixId: string, deps?: Partial<IFixDeps>): Promise<void>` where `IFixDeps = { fetch: (url: string) => Promise<string>; ai: (prompt: string) => Promise<string | null>; byQuestion: (brandId: string, brandName: string, competitors: string[]) => Promise<ILostTo['byQuestion']>; aiSaid: (brandId: string, competitor: string) => Promise<string[]> }`.

- [ ] **Step 1: Failing checks** (in the Mongo part, after the usage block)

```ts
import { runFix } from '../service/fix/runFix'
import brandModel from '../model/brandModel'
// ...
    const brand = await brandModel.create({
        orgId, name: 'Hasan Oud', website: 'https://s.in', category: 'Fragrances & Perfumes',
        products, competitors: [{ name: 'Ajmal', website: 'https://ajmal.example' }]
    })
    const mk = (extra: object) => generatedFixModel.create({ ...base, brandId: brand._id, status: 'pending', ...extra })
    const okAi = async () => '{"title":"Attar FAQ","items":[{"question":"Alcohol-free?","answer":"Yes.","source":"https://s.in/a1"}]}'
    const fetchOk = async () => html
    const noLost = async () => []

    // Happy path: done, items saved, pages recorded, note when some pages failed
    const f1 = await mk({ type: 'faq', kind: 'attar' })
    await runFix(String(f1._id), { fetch: async (u) => (u.endsWith('a2') ? Promise.reject(new Error('x')) : html), ai: okAi, byQuestion: noLost, aiSaid: async () => [] })
    const d1 = (await generatedFixModel.findById(f1._id).lean())!
    assert.equal(d1.status, 'done')
    assert.equal(d1.items[0].source, 'https://s.in/a1')
    assert.equal(d1.pagesRead.filter((p) => p.ok).length, 4)
    assert.equal(d1.note, 'Read 4 of 5 pages')

    // No page opens: failed, with the reason, not counted
    const f2 = await mk({ type: 'faq', kind: 'attar' })
    await runFix(String(f2._id), { fetch: async () => Promise.reject(new Error('blocked')), ai: okAi, byQuestion: noLost, aiSaid: async () => [] })
    const d2 = (await generatedFixModel.findById(f2._id).lean())!
    assert.equal(d2.status, 'failed')
    assert.ok(d2.error!.startsWith("Couldn't open pages on your site"))

    // Broken JSON twice: failed; broken once then good: done (one retry)
    let calls = 0
    const f3 = await mk({ type: 'faq', kind: 'attar' })
    await runFix(String(f3._id), { fetch: fetchOk, ai: async () => (++calls === 1 ? 'oops' : await okAi()), byQuestion: noLost, aiSaid: async () => [] })
    assert.equal((await generatedFixModel.findById(f3._id).lean())!.status, 'done')
    assert.equal(calls, 2)
    const f4 = await mk({ type: 'faq', kind: 'attar' })
    await runFix(String(f4._id), { fetch: fetchOk, ai: async () => 'oops', byQuestion: noLost, aiSaid: async () => [] })
    assert.equal((await generatedFixModel.findById(f4._id).lean())!.error, "Couldn't write this one, try again")

    // Comparison: competitor pages read too, and their URLs are allowed sources
    const seen: string[] = []
    const f5 = await mk({ type: 'comparison', competitor: 'Ajmal' })
    await runFix(String(f5._id), {
        fetch: async (u) => { seen.push(u); return u.startsWith('https://ajmal.example') ? '<a href="/products/x">x</a><main>Ajmal oud</main>' : html },
        ai: async () => '{"title":"Hasan Oud vs Ajmal","items":[{"heading":"About Ajmal","body":"Oud maker.","source":"https://ajmal.example"}]}',
        byQuestion: async () => [{ queryText: 'best bakhoor for home', rows: [{ model: 'ChatGPT', you: null, others: [{ name: 'Ajmal', position: 1 }] }] }],
        aiSaid: async () => ['Ajmal is a known oud brand']
    })
    const d5 = (await generatedFixModel.findById(f5._id).lean())!
    assert.equal(d5.status, 'done')
    assert.ok(seen.includes('https://s.in/b1') && seen.includes('https://ajmal.example'))
    assert.equal(d5.items[0].source, 'https://ajmal.example')

    // A fix that isn't pending (already done or failed) is left alone
    await runFix(String(f1._id), { fetch: fetchOk, ai: async () => { throw new Error('should not run') }, byQuestion: noLost, aiSaid: async () => [] })
```

Check that `brandModel.create` accepts these fields; add any other required fields the schema needs (read `model/brandModel.ts` required props first).

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement**

`costLogService.ts`: `purpose: ... | 'free-check' | 'fix'`.

`service/fix/runFix.ts`:
```ts
import generatedFixModel from '../../model/generatedFixModel'
import brandModel from '../../model/brandModel'
import mentionModel from '../../model/mentionModel'
import config from '../../config/config'
import aiService from '../aiService'
import logger from '../../util/loger'
import { auditService } from '../auditService'
import { withAiCallContext } from '../costLogService'
import { computeLostTo, loadScanPair, nameMatcher, type ILostTo } from '../competitorService'
import { pickOwnUrls, wonQueries } from './pickPages'
import { homepageLinks, readPages } from './readPages'
import { buildFixPrompt, parseFixResponse } from './prompt'
import type { IBrandProduct } from '../../types/brandTypes'

export interface IFixDeps {
    fetch: (url: string) => Promise<string>
    ai: (prompt: string) => Promise<string | null>
    byQuestion: (brandId: string, brandName: string, competitors: string[]) => Promise<ILostTo['byQuestion']>
    aiSaid: (brandId: string, competitor: string) => Promise<string[]>
}

const MAX_TOKENS = 4000

const defaultDeps: IFixDeps = {
    fetch: undefined as unknown as IFixDeps['fetch'], // readPages/homepageLinks use their own SSRF-safe fetch
    ai: async (prompt) =>
        (await aiService.callClaude(prompt, MAX_TOKENS, config.FIX_MODEL_CLAUDE)) ??
        (await aiService.callOpenAiCompatible('OpenAI', prompt, config.FIX_MODEL_OPENAI, MAX_TOKENS)),
    byQuestion: async (brandId, brandName, competitors) => {
        const brand = await brandModel.findById(brandId).select('lastScanId').lean()
        const { current } = await loadScanPair(brandId, (brand as { lastScanId?: string } | null)?.lastScanId)
        return computeLostTo(current, brandName, competitors, []).byQuestion
    },
    // Sentences from stored AI answers that name the competitor
    aiSaid: async (brandId, competitor) => {
        const re = nameMatcher(competitor)
        const rows = await mentionModel.find({ brandId }).sort({ createdAt: -1 }).limit(60).select('rawText').lean()
        return rows
            .flatMap((m) => String((m as { rawText?: string }).rawText || '').split(/(?<=[.!?])\s+/))
            .filter((s) => re.test(s))
            .slice(0, 5)
    }
}

const finish = (id: string, update: object) => generatedFixModel.updateOne({ _id: id }, { ...update, finishedAt: new Date() })

export const runFix = async (fixId: string, deps: Partial<IFixDeps> = {}) => {
    const d = { ...defaultDeps, ...deps }
    const fetch = deps.fetch // undefined → the readers' own SSRF-safe fetch
    const fix = await generatedFixModel.findById(fixId).lean()
    if (!fix || fix.status !== 'pending') return
    try {
        const brand = await brandModel.findById(fix.brandId).lean()
        if (!brand) return void (await finish(fixId, { status: 'failed', error: 'Brand not found' }))
        const products = ((brand as { products?: IBrandProduct[] }).products ?? []) as IBrandProduct[]
        const competitors = ((brand as { competitors?: Array<{ name: string; website?: string }> }).competitors ?? [])
        const home = auditService.cleanUrl(String((brand as { website?: string }).website || ''))
        const byQuestion = fix.type === 'comparison' ? await d.byQuestion(String(fix.brandId), brand.name, competitors.map((c) => c.name)) : []

        let ownUrls = pickOwnUrls({ type: fix.type, kind: fix.kind, competitor: fix.competitor, products, byQuestion })
        if (!ownUrls.length) ownUrls = await homepageLinks(home, fetch)
        const own = await readPages(ownUrls, fetch)

        let theirs = { pages: [] as typeof own.pages, read: [] as typeof own.read }
        let aiSaid: string[] = []
        if (fix.type === 'comparison' && fix.competitor) {
            const site = competitors.find((c) => c.name === fix.competitor)?.website
            if (site) theirs = await readPages((await homepageLinks(auditService.cleanUrl(site), fetch, 3)), fetch)
            aiSaid = await d.aiSaid(String(fix.brandId), fix.competitor)
        }

        const pagesRead = [...own.read, ...theirs.read]
        if (!own.pages.length) {
            return void (await finish(fixId, { status: 'failed', pagesRead, error: `Couldn't open pages on your site: ${ownUrls[0] || home}` }))
        }

        const questions =
            fix.type === 'comparison'
                ? wonQueries(byQuestion, fix.competitor ?? '')
                : ((brand as { queries?: Array<{ text: string }> }).queries ?? []).map((q) => q.text)
        const prompt = buildFixPrompt({
            type: fix.type, brandName: brand.name, competitor: fix.competitor, kind: fix.kind,
            language: fix.language, questions, pages: own.pages, competitorPages: theirs.pages, aiSaid
        })
        const allowed = [...own.pages, ...theirs.pages].map((p) => p.url)
        let parsed = null
        for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
            const raw = await withAiCallContext({ brandId: String(fix.brandId), purpose: 'fix' }, () => d.ai(prompt))
            parsed = raw ? parseFixResponse(raw, fix.type, allowed) : null
        }
        if (!parsed) return void (await finish(fixId, { status: 'failed', pagesRead, error: "Couldn't write this one, try again" }))

        const okCount = own.read.filter((r) => r.ok).length
        await finish(fixId, {
            status: 'done',
            pagesRead,
            title: parsed.title,
            items: parsed.items,
            note: okCount < own.read.length ? `Read ${okCount} of ${own.read.length} pages` : null
        })
    } catch (err) {
        logger.error('[fix] generation failed', { meta: { fixId, err } })
        await finish(fixId, { status: 'failed', error: "Couldn't write this one, try again" })
    }
}
```

Notes for the implementer:
- `readPages(urls, undefined)` and `homepageLinks(home, undefined)` fall back to their default fetch because JS default params apply to `undefined`.
- Remove the `fetch` key from `defaultDeps` if TypeScript complains; it's only there so `IFixDeps` is complete.
- Confirm `mentionModel` has `rawText` and `createdAt` (it's used in `computeLostTo`); adjust the sort field if it uses `scannedAt`.

- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(fix): worker job reads pages, writes with ai and saves"`

---

### Task 7: Creating a fix (limit + lock), queue, worker, API

**Files:**
- Create: `backend/src/service/fix/createFix.ts`, `backend/src/controller/fixController.ts`
- Modify: `backend/src/service/queueService.ts`, `backend/src/service/workerService.ts`, `backend/src/router/apiRouter.ts`
- Test: `generatedFix.check.ts`

**Interfaces:**
- Consumes: `countFixUsage`, `nextResetLabel`, `PLAN_LIMITS`, `lockModel`, `runFix`, `kindsOf`, `fixOutputs`.
- Produces:
  - `createFix(input: { orgId: string; brandId: string; userId: string; plan: PlanName; type: FixType; kind?: string | null; competitor?: string | null; language: FixLanguage }, enqueue?: (fixId: string) => Promise<unknown>, now?: Date): Promise<{ ok: true; fixId: string } | { ok: false; status: 403 | 409; message: string }>`
  - `fixQueue` (`'fix-generation'`, attempts 1), `enqueueFixJob(fixId: string)`
  - Routes: `GET /brands/:id/fixes` → `{ fixes: [...with outputs], usage: { used, limit, resetsOn }, kinds, competitors }`; `POST /brands/:id/fixes` → `{ fixId }`; `GET /brands/:id/fixes/:fixId` → fix + outputs; `PATCH /brands/:id/fixes/:fixId` `{ title?, items }` → fix + outputs.

- [ ] **Step 1: Failing checks**

```ts
import { createFix } from '../service/fix/createFix'
// ...
    // Limit: free plan has 1; a second request the same month is refused with the reset date
    const org2 = String(new mongoose.Types.ObjectId())
    const req = { orgId: org2, brandId: String(brand._id), userId: String(base.userId), plan: 'free' as const, type: 'faq' as const, kind: 'attar', language: 'en' as const }
    const queued: string[] = []
    const enq = async (id: string) => queued.push(id)
    const first = await createFix(req, enq, now)
    assert.ok(first.ok && queued.length === 1)
    const second = await createFix(req, enq, now)
    assert.deepEqual(second, { ok: false, status: 403, message: "You've used all 1 generations this month. They reset on 1 Nov." })
    // Parallel clicks on the last generation: exactly one gets through
    const org3 = String(new mongoose.Types.ObjectId())
    const both = await Promise.all([createFix({ ...req, orgId: org3 }, enq, now), createFix({ ...req, orgId: org3 }, enq, now)])
    assert.equal(both.filter((r) => r.ok).length, 1)
    // Queue down: the fix is marked failed and the slot is freed
    const org4 = String(new mongoose.Types.ObjectId())
    const down = await createFix({ ...req, orgId: org4 }, async () => null, now)
    assert.equal(down.ok, false)
    assert.equal(await countFixUsage(org4, now), 0)
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement**

`service/fix/createFix.ts`:
```ts
import mongoose from 'mongoose'
import lockModel from '../../model/lockModel'
import generatedFixModel from '../../model/generatedFixModel'
import { PLAN_LIMITS, type PlanName } from '../../config/planLimits'
import { countFixUsage, nextResetLabel } from './usage'
import type { FixLanguage, FixType } from '../../types/fixTypes'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// One create at a time per org, so two tabs can't both take the last generation
const withFixLock = async <T>(orgId: string, fn: () => Promise<T>): Promise<T | null> => {
    const _id = `fix:${orgId}`
    const deadline = Date.now() + 5000
    for (;;) {
        try {
            await lockModel.create({ _id, at: new Date() })
            break
        } catch (err) {
            if ((err as { code?: number }).code !== 11000) throw err
            await lockModel.deleteOne({ _id, at: { $lt: new Date(Date.now() - 60_000) } })
            if (Date.now() > deadline) return null
            await sleep(50)
        }
    }
    try {
        return await fn()
    } finally {
        await lockModel.deleteOne({ _id }).catch(() => undefined)
    }
}

export const createFix = async (
    input: { orgId: string; brandId: string; userId: string; plan: PlanName; type: FixType; kind?: string | null; competitor?: string | null; language: FixLanguage },
    enqueue: (fixId: string) => Promise<unknown>,
    now = new Date()
): Promise<{ ok: true; fixId: string } | { ok: false; status: 403 | 409; message: string }> => {
    const limit = PLAN_LIMITS[input.plan].maxFixGenerations
    const created = await withFixLock(input.orgId, async () => {
        if ((await countFixUsage(input.orgId, now)) >= limit) return null
        return generatedFixModel.create({
            orgId: new mongoose.Types.ObjectId(input.orgId),
            brandId: new mongoose.Types.ObjectId(input.brandId),
            userId: new mongoose.Types.ObjectId(input.userId),
            type: input.type,
            kind: input.type === 'faq' ? input.kind || null : null,
            competitor: input.type === 'comparison' ? input.competitor || null : null,
            language: input.language,
            status: 'pending',
            createdAt: now
        })
    })
    if (!created) return { ok: false, status: 403, message: `You've used all ${limit} generations this month. They reset on ${nextResetLabel(now)}.` }
    const fixId = String(created._id)
    if (!(await enqueue(fixId))) {
        await generatedFixModel.updateOne({ _id: fixId }, { status: 'failed', error: 'Busy right now, try again in a minute', finishedAt: new Date() })
        return { ok: false, status: 409, message: 'Busy right now, try again in a minute' }
    }
    return { ok: true, fixId }
}
```

Note: the lock-timeout path also returns the 403 limit message; acceptable since it only happens when another create for the same org is stuck > 5 s.

`queueService.ts`:
```ts
// One try: a retry would pay for the same writing again; the user can press Generate again
export const fixQueue = new Queue('fix-generation', { connection, defaultJobOptions: { ...defaultJobOptions, attempts: 1 } })

export const enqueueFixJob = async (fixId: string): Promise<Job<{ fixId: string }> | null> => {
    try {
        return await enqueueWithTimeout(fixQueue.add('fix-job', { fixId }, { jobId: `fix-${fixId}` }), 1500)
    } catch (err) {
        logger.error(`[BullMQ Queue Error] Failed to enqueue fix ${fixId}:`, { meta: err })
        return null
    }
}
```

`workerService.ts`: import `runFix` from `./fix/runFix`, add
```ts
    const fixWorker = new Worker<{ fixId: string }>('fix-generation', async (job: Job<{ fixId: string }>) => runFix(job.data.fixId), {
        connection,
        concurrency: 2
    })
```
and add `fixWorker` to the `workers` array.

`controller/fixController.ts` (same brand lookup and plan rule as `productController.loadBrand`):
```ts
import { Request, Response, NextFunction } from 'express'
import mongoose from 'mongoose'
import { IAuthenticatedRequest } from '../middleware/authentication'
import databseService from '../service/databseService'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import responceseMessage from '../constent/responceseMessage'
import { EUserRole } from '../constent/userConstent'
import { PLAN_LIMITS, type PlanName } from '../config/planLimits'
import generatedFixModel from '../model/generatedFixModel'
import { createFix } from '../service/fix/createFix'
import { countFixUsage, nextResetLabel } from '../service/fix/usage'
import { kindsOf } from '../service/fix/pickPages'
import { fixOutputs } from '../service/fix/output'
import { enqueueFixJob } from '../service/queueService'
import type { IGeneratedFix } from '../types/fixTypes'

const TYPES = ['faq', 'comparison']
const LANGUAGES = ['en', 'hi-en', 'hi']

const loadBrand = async (req: Request, next: NextFunction) => {
    const { authenticatedUser } = req as IAuthenticatedRequest
    const org = await databseService.findOrgByOwnerId(authenticatedUser._id.toString())
    if (!org) return void httpError(next, new Error(responceseMessage.NOT_FOUND('Workspace')), req, 404)
    const brand = await databseService.findBrandByIdAndOrgId(req.params.id, org._id.toString())
    if (!brand) return void httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
    const plan = authenticatedUser.role === EUserRole.ADMIN ? 'agency' : ((org.plan || 'free') as PlanName)
    return { org, brand, plan, userId: authenticatedUser._id.toString() }
}

const view = (fix: IGeneratedFix) => ({ ...fix, outputs: fix.status === 'done' ? fixOutputs(fix) : null })

const loadFix = async (req: Request, brandId: string) =>
    mongoose.isValidObjectId(req.params.fixId) ? generatedFixModel.findOne({ _id: req.params.fixId, brandId }).lean() : null

export default {
    list: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const found = await loadBrand(req, next)
            if (!found) return
            const { org, brand, plan } = found
            const fixes = await generatedFixModel.find({ brandId: brand._id, status: { $ne: 'failed' } }).sort({ createdAt: -1 }).limit(50).lean()
            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                fixes: fixes.map((f) => view(f as IGeneratedFix)),
                usage: { used: await countFixUsage(String(org._id)), limit: PLAN_LIMITS[plan].maxFixGenerations, resetsOn: nextResetLabel(new Date()) },
                kinds: kindsOf(brand.products || []),
                competitors: (brand.competitors || []).map((c: { name: string }) => c.name)
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    create: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const found = await loadBrand(req, next)
            if (!found) return
            const { type, kind, competitor, language = 'en' } = req.body || {}
            if (!TYPES.includes(type) || !LANGUAGES.includes(language) || (type === 'comparison' && typeof competitor !== 'string')) {
                return httpError(next, new Error('Choose a FAQ or a comparison, and a language'), req, 422)
            }
            const result = await createFix(
                {
                    orgId: String(found.org._id), brandId: String(found.brand._id), userId: found.userId, plan: found.plan,
                    type, kind: typeof kind === 'string' ? kind.slice(0, 50) : null,
                    competitor: typeof competitor === 'string' ? competitor.slice(0, 100) : null, language
                },
                enqueueFixJob
            )
            if (!result.ok) return httpError(next, new Error(result.message), req, result.status)
            httpResponse(req, res, 201, responceseMessage.SUCCESS, { fixId: result.fixId })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    get: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const found = await loadBrand(req, next)
            if (!found) return
            const fix = await loadFix(req, String(found.brand._id))
            if (!fix) return httpError(next, new Error(responceseMessage.NOT_FOUND('Fix')), req, 404)
            httpResponse(req, res, 200, responceseMessage.SUCCESS, view(fix as IGeneratedFix))
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    // The owner's edits (filling [confirm] marks, rewording); never counts against the limit
    update: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const found = await loadBrand(req, next)
            if (!found) return
            const fix = await loadFix(req, String(found.brand._id))
            if (!fix || fix.status !== 'done') return httpError(next, new Error(responceseMessage.NOT_FOUND('Fix')), req, 404)
            const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 30) : null
            if (!items) return httpError(next, new Error('Nothing to save'), req, 422)
            const clean = items.map((i: Record<string, unknown>) => ({
                ...(typeof i.question === 'string' ? { question: i.question.slice(0, 500) } : {}),
                ...(typeof i.answer === 'string' ? { answer: i.answer.slice(0, 3000) } : {}),
                ...(typeof i.heading === 'string' ? { heading: i.heading.slice(0, 200) } : {}),
                ...(typeof i.body === 'string' ? { body: i.body.slice(0, 5000) } : {}),
                ...(Array.isArray(i.rows) ? { rows: (i.rows as Array<Record<string, unknown>>).slice(0, 20).map((r) => ({ label: String(r.label ?? '').slice(0, 200), brand: String(r.brand ?? '').slice(0, 500), competitor: String(r.competitor ?? '').slice(0, 500) })) } : {}),
                ...(typeof i.source === 'string' ? { source: i.source.slice(0, 500) } : {})
            }))
            const title = typeof req.body?.title === 'string' ? req.body.title.slice(0, 200) : fix.title
            const saved = await generatedFixModel.findByIdAndUpdate(fix._id, { items: clean, title }, { new: true }).lean()
            httpResponse(req, res, 200, responceseMessage.SUCCESS, view(saved as IGeneratedFix))
        } catch (error) {
            httpError(next, error, req, 500)
        }
    }
}
```

`apiRouter.ts`, next to the recommendations routes:
```ts
router.route('/brands/:id/fixes').get(authentication, fixController.list).post(authentication, fixController.create)
router.route('/brands/:id/fixes/:fixId').get(authentication, fixController.get).patch(authentication, fixController.update)
```
plus `import fixController from '../controller/fixController'`.

- [ ] **Step 4: Run check, then** `npm run lint` and `npx tsc --noEmit` in `backend/`. Expected: check passes, no lint/type errors.
- [ ] **Step 5: Commit** — `git commit -m "feat(fix): create with monthly limit, queue, worker and api"`

---

### Task 8: Frontend — Fixes page, nav, recommendation link

**Files:**
- Create: `frontend/src/pages/Fixes.tsx`
- Modify: `frontend/src/router.tsx` (route `fixes`), `frontend/src/components/AppLayout.tsx` (nav item `{ path: '/fixes', label: 'Fixes', icon: '✎' }` after Recommendations), `frontend/src/pages/Recommendations.tsx`

**Interfaces:**
- Consumes: the API from Task 7; outlet context `currentBrand._id` (same as Recommendations).

- [ ] **Step 1: Build `Fixes.tsx`** with these parts (match the existing page styles: `card`, `btn`, `btn-primary`, CSS variables as in `Recommendations.tsx`):
  - Header "Fixes for <brand>" and usage pill `"{used}/{limit} generations used this month · resets {resetsOn}"`.
  - Generate panel: type radio (FAQ / Comparison); for FAQ a select of `kinds` (`"Attar (6)"`) plus "Whole brand" (value `''`); for comparison a select of `competitors` (default the first); language select (English / Hinglish / हिंदी); "Generate" button disabled while a fix is pending or `used >= limit`. When `kinds` is empty show "Add products in Settings → Products for a better FAQ" with a link to `/settings`.
  - On Generate: `POST /brands/:id/fixes`; on 403/409 show the server message; on success poll `GET /brands/:id/fixes/:fixId` every 3 s (stop on `done`/`failed`, and after 3 minutes show "Still writing — check back in a minute"). Show "Writing… this takes about a minute".
  - List of saved fixes (newest first): title, type, kind/competitor, language, date. Clicking opens the editor.
  - Editor: each item editable (`textarea` for answer/body, inputs for question/heading, table cells for rows); `[confirm: …]` text highlighted (yellow background) with a hint "Fill these before publishing"; source shown under each item as a small link. "Save changes" → `PATCH`. `note` (e.g. "Read 4 of 5 pages") shown at the top.
  - Copy buttons: Copy text / Copy HTML / Copy FAQ schema (last one only when `outputs.jsonLd`), using `navigator.clipboard.writeText` and a "Copied ✓" state like `copySnippet` in Recommendations.
  - Failed fix (from create or poll): show its `error` and "Not counted against your limit."

- [ ] **Step 2: Wire route and nav.** `router.tsx`: `import Fixes from './pages/Fixes';` and `{ path: 'fixes', element: <Fixes /> }` after `recommendations`. `AppLayout.tsx`: nav item after Recommendations.

- [ ] **Step 3: Recommendations link.** In `Recommendations.tsx`, for a rec whose text matches `/faq|comparison|\bvs\b|versus/i`, show next to the existing button a `btn` "Write it with your pages" that navigates to `/fixes?type=faq` (or `type=comparison`). `Fixes.tsx` reads `type` from `useSearchParams` to preselect.

- [ ] **Step 4: Verify.** `cd frontend && npx tsc -b && npm run lint`. Expected: no new errors (the two existing `Settings.tsx` warnings stay).

- [ ] **Step 5: Run it locally.** Start backend API + worker and frontend (`npm run dev` in each, Mongo/Redis local, SMTP blanked, `ALLOW_INLINE_JOBS` not needed if Redis runs). Log in with a local test user, open `/fixes`, generate one FAQ against a public Shopify store URL saved as the brand's website. Confirm: pending → done, items with sources, copy buttons work, editing saves, usage pill goes up by 1; a failed one (brand website `https://example.invalid`) shows the error and doesn't count. Note the AI Models page needs a price row for the fix model or the cost log warns (`No price for model`).

- [ ] **Step 6: Commit** — `git commit -m "feat(fix): fixes page with generate panel, editor and copy buttons"`

---

### Task 9: Release prep

- [ ] **Step 1:** Run all checks touched: `generatedFix.check.ts`, `recommendations.check.ts`, `products.check.ts`, `lostTo.check.ts` (SMTP blanked). Backend lint + tsc, frontend tsc + lint, website untouched.
- [ ] **Step 2:** Push branch, open PR (no Claude attribution), wait for green checks, hand the merge command to the user.
- [ ] **Step 3:** After merge + Images: user runs staging Deploy. Then user adds AI Models rows on staging (and later prod) for `claude-sonnet-5-5` and `gpt-4o` with their per-1k prices, **Disabled** (so scans don't pick them; helper/fix calls pass the model id directly). Verify the Anthropic key can call `claude-sonnet-5-5` (one generation on staging shows a cost-log row with purpose `fix`).
- [ ] **Step 4:** Test Sheet feature N16 with positive/negative cases (FAQ per kind, whole brand, comparison, Hinglish, `[confirm]` marks, edit + save, copy outputs, monthly limit message, failed site not counted, parallel clicks). Tester agent runs them on staging.
- [ ] **Step 5:** Prod deploy with the staging-tested SHA after the user's go-ahead.
