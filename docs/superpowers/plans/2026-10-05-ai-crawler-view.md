# AI Crawler View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show side by side what AI crawlers (raw HTML) and shoppers (after JavaScript) see on the homepage and first product page, and flag what the AI misses.

**Architecture:** A pure cheerio extractor (`extractPageFacts`, `compareFacts`) runs on the raw HTML fetched with the GPTBot user-agent and on the Chrome-rendered HTML. A POST endpoint runs both, saves `audit.aiView`, and the Website audit page renders it.

**Tech Stack:** Express + Mongoose + cheerio + puppeteer (already installed), React 19.

**Spec:** `docs/superpowers/specs/2026-10-05-ai-crawler-view-design.md`

## Global Constraints

- No new dependencies.
- Checks are `assert` scripts under `backend/src/checks/`, run with `NODE_ENV=development npx ts-node --transpile-only src/checks/<file>.ts`. No network in the check.
- Local backend runs with `SMTP_USER= SMTP_PASS= EMAIL_SERVICE_API_KEY= RESEND_API_KEY=`.
- The browser (Playwright MCP) is in use by the QA agent; browser checks wait until it reports back.
- Commit subjects lower-case (commitlint).

## Review Focus

- Prices written as `Rs. 1,299.00` or `₹1,299` → parsed as 1299 and shown as "₹1,299" (Task 1 check).
- JSON-LD `offers` given as an array, or the Product nested in `@graph` → still found (Task 1 check).
- A page that blocks or times out in Chrome → the AI column still shows and the shopper column says it couldn't load (Task 2, `shopper: null` path in `compareFacts`).
- A homepage with no product links → only the homepage is checked, with no error (Task 2: `productLinksIn` returns []).
- Huge pages → the preview is capped at 300 characters and the word count stays cheap (Task 1).

---

### Task 1: Extractor and comparison

**Files:**
- Modify: `backend/src/service/auditService.ts` (export `schemaTypesIn`, `productLinksIn`)
- Create: `backend/src/service/aiViewService.ts`
- Create: `backend/src/checks/aiView.check.ts`

**Interfaces:**
- Produces:
  - `interface IPageFacts { name: string | null; price: string | null; rating: string | null; words: number; images: { total: number; withAlt: number }; schemaTypes: string[]; preview: string }`
  - `interface IFactRow { key: 'name' | 'price' | 'rating' | 'description' | 'schema'; label: string; ai: string | null; shopper: string | null; missingForAi: boolean }`
  - `extractPageFacts(html: string): IPageFacts`
  - `compareFacts(ai: IPageFacts, shopper: IPageFacts | null): IFactRow[]`

- [ ] **Step 1: Write the failing check** in `backend/src/checks/aiView.check.ts`:

```ts
/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/aiView.check.ts
import assert from 'assert'
import { extractPageFacts, compareFacts } from '../service/aiViewService'

const spaRaw = '<html><head><title>Silk Oud | Shop</title></head><body><div id="root"></div><script>render()</script></body></html>'
const spaRendered = `<html><head><title>Silk Oud | Shop</title></head><body><div id="root"><h1>Silk Oud Attar</h1>
<p>${'Rich long lasting alcohol free oud attar for daily wear. '.repeat(12)}</p>
<span class="price">Rs. 1,299.00</span><div>4.7 out of 5 (212 reviews)</div>
<img src="a.jpg" alt="Silk Oud bottle"><img src="b.jpg"></div></body></html>`
const shopify = `<html><head><meta property="og:title" content="Amber Rose"><script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Amber Rose Attar","offers":[{"@type":"Offer","price":"549.00","priceCurrency":"INR"}],
"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.8","reviewCount":"96"}}]}</script></head>
<body><h1>Amber Rose</h1><p>${'Soft rose and amber attar. '.repeat(30)}</p><span>₹549</span></body></html>`

const raw = extractPageFacts(spaRaw)
const rendered = extractPageFacts(spaRendered)
assert.equal(raw.price, null)
assert.equal(raw.rating, null)
assert.equal(raw.name, 'Silk Oud | Shop')
assert.equal(rendered.name, 'Silk Oud Attar')
assert.equal(rendered.price, '₹1,299')
assert.equal(rendered.rating, '4.7 (212 reviews)')
assert.deepStrictEqual(rendered.images, { total: 2, withAlt: 1 })
assert.ok(rendered.words > 100)
assert.ok(rendered.preview.length <= 300)

const rows = compareFacts(raw, rendered)
const missing = rows.filter((r) => r.missingForAi).map((r) => r.key)
assert.deepStrictEqual(missing, ['price', 'rating', 'description'])

const s = extractPageFacts(shopify)
assert.equal(s.name, 'Amber Rose Attar')
assert.equal(s.price, '₹549')
assert.equal(s.rating, '4.8 (96 reviews)')
assert.ok(s.schemaTypes.includes('product'))
assert.deepStrictEqual(compareFacts(s, s).filter((r) => r.missingForAi), [])

// Chrome failed: nothing can be marked missing
assert.deepStrictEqual(compareFacts(raw, null).filter((r) => r.missingForAi), [])
console.log('ai-view checks: PASS')
process.exit(0)
```

- [ ] **Step 2: Run it and see it fail** ("Cannot find module '../service/aiViewService'").

- [ ] **Step 3: Implement.** In `auditService.ts`, add `export` to `const schemaTypesIn` and `const productLinksIn`. Create `aiViewService.ts`:

```ts
// What an AI crawler (raw HTML) and a shopper (after JavaScript) can read on a page
import * as cheerio from 'cheerio'
import { schemaTypesIn } from './auditService'

export interface IPageFacts {
    name: string | null
    price: string | null
    rating: string | null
    words: number
    images: { total: number; withAlt: number }
    schemaTypes: string[]
    preview: string
}

export interface IFactRow {
    key: 'name' | 'price' | 'rating' | 'description' | 'schema'
    label: string
    ai: string | null
    shopper: string | null
    missingForAi: boolean
}

type Json = Record<string, unknown>

// Every object in the page's JSON-LD, at any depth
const jsonLdNodes = ($: cheerio.CheerioAPI): Json[] => {
    const out: Json[] = []
    const walk = (n: unknown): void => {
        if (Array.isArray(n)) return n.forEach(walk)
        if (!n || typeof n !== 'object') return
        out.push(n as Json)
        Object.values(n).forEach(walk)
    }
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            walk(JSON.parse($(el).html() || '{}'))
        } catch {
            // invalid JSON-LD
        }
    })
    return out
}

const isType = (n: Json, t: string) => [n['@type']].flat().some((x) => typeof x === 'string' && x.toLowerCase() === t)

const formatPrice = (amount: string) => {
    const n = Number(amount.replace(/,/g, ''))
    return Number.isFinite(n) && n > 0 ? `₹${Math.round(n).toLocaleString('en-IN')}` : null
}

export const extractPageFacts = (html: string): IPageFacts => {
    const $ = cheerio.load(html)
    const nodes = jsonLdNodes($)
    const product = nodes.find((n) => isType(n, 'product'))
    const offer = nodes.find((n) => isType(n, 'offer') && n.price != null)
    const agg = nodes.find((n) => isType(n, 'aggregaterating'))

    $('script, style, noscript, template, svg').remove()
    const text = $('body').text().replace(/\s+/g, ' ').trim()

    const name =
        (typeof product?.name === 'string' && product.name.trim()) ||
        $('meta[property="og:title"]').attr('content')?.trim() ||
        $('h1').first().text().trim() ||
        $('title').text().trim() ||
        null

    const metaPrice = $('meta[property="product:price:amount"], meta[property="og:price:amount"]').attr('content')
    const textPrice = text.match(/(?:₹|Rs\.?|INR)\s?([\d,]+(?:\.\d+)?)/i)?.[1]
    const price = formatPrice(String(offer?.price ?? metaPrice ?? textPrice ?? ''))

    let rating: string | null = null
    if (agg?.ratingValue != null) {
        rating = `${agg.ratingValue}${agg.reviewCount != null ? ` (${agg.reviewCount} reviews)` : ''}`
    } else {
        const value = text.match(/(\d(?:\.\d)?)\s*(?:out of 5|\/\s*5|★|stars?)/i)?.[1]
        const count = text.match(/\(?(\d[\d,]*)\s+reviews?\)?/i)?.[1]
        if (value) rating = `${value}${count ? ` (${count} reviews)` : ''}`
    }

    const imgs = $('img')
    return {
        name,
        price,
        rating,
        words: text ? text.split(' ').length : 0,
        images: { total: imgs.length, withAlt: imgs.filter((_, el) => !!$(el).attr('alt')?.trim()).length },
        schemaTypes: schemaTypesIn(html),
        preview: text.slice(0, 300)
    }
}

export const compareFacts = (ai: IPageFacts, shopper: IPageFacts | null): IFactRow[] => {
    const row = (key: IFactRow['key'], label: string, a: string | null, s: string | null, missing: boolean): IFactRow => ({
        key,
        label,
        ai: a,
        shopper: shopper ? s : null,
        missingForAi: !!shopper && missing
    })
    const hasProduct = (f: IPageFacts) => (f.schemaTypes.includes('product') ? 'Found' : null)
    return [
        row('name', 'Product name', ai.name, shopper?.name ?? null, !ai.name && !!shopper?.name),
        row('price', 'Price', ai.price, shopper?.price ?? null, !ai.price && !!shopper?.price),
        row('rating', 'Rating & reviews', ai.rating, shopper?.rating ?? null, !ai.rating && !!shopper?.rating),
        row(
            'description',
            'Description',
            `${ai.words} words`,
            shopper ? `${shopper.words} words` : null,
            !!shopper && shopper.words >= 50 && ai.words < shopper.words / 2
        ),
        row('schema', 'Product schema', hasProduct(ai), shopper ? hasProduct(shopper) : null, !hasProduct(ai) && !!shopper && !!hasProduct(shopper))
    ]
}
```

- [ ] **Step 4: Run the check** → `ai-view checks: PASS`; `npx tsc --noEmit -p .` and eslint clean.
- [ ] **Step 5: Commit** `feat(ai-view): extract and compare what ai crawlers and shoppers see`

### Task 2: Fetch, render, API

**Files:**
- Modify: `backend/src/service/reportService/pdfService.ts` (export `withBrowser`, use it in `generateReportPdf`)
- Modify: `backend/src/service/aiViewService.ts` (add `runAiView`)
- Modify: `backend/src/model/auditModel.ts`, `backend/src/types/auditTypes.ts` (`aiView` field)
- Modify: `backend/src/controller/auditController.ts`, `backend/src/router/apiRouter.ts`

**Interfaces:**
- Consumes: `extractPageFacts`, `compareFacts`, `productLinksIn(html, siteUrl)`, `auditService.cleanUrl`.
- Produces: `withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T>`; `runAiView(website: string): Promise<IAiView>` where `IAiView = { checkedAt: Date; pages: Array<{ url: string; label: 'Product page' | 'Homepage'; rows: IFactRow[]; aiPreview: string; error?: string }> }`; `POST /brands/:id/audit/ai-view` → `{ aiView }`.

- [ ] **Step 1:** In `pdfService.ts`, move the launch/acquire/release/close lifecycle into:
```ts
export const withBrowser = async <T>(fn: (browser: Browser) => Promise<T>): Promise<T> => {
    await acquire()
    const browser = await puppeteer
        .launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] })
        .catch((err) => {
            release()
            throw err
        })
    try {
        return await fn(browser)
    } finally {
        await browser.close()
        release()
    }
}
```
and make `generateReportPdf` call `withBrowser(async (browser) => { ...same page/pdf code... })`. Import `type Browser` from `puppeteer`.

- [ ] **Step 2:** Append to `aiViewService.ts`:
```ts
const GPTBOT_UA = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)'

const fetchRaw = async (url: string) =>
    (await axios.get<string>(url, { timeout: 10000, responseType: 'text', headers: { 'User-Agent': GPTBOT_UA } })).data

const render = (url: string) =>
    withBrowser(async (browser) => {
        const page = await browser.newPage()
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 })
        return page.content()
    })

export const runAiView = async (website: string): Promise<IAiView> => {
    const home = auditService.cleanUrl(website)
    const homeHtml = await fetchRaw(home).catch(() => '')
    const product = homeHtml ? productLinksIn(homeHtml, home)[0] : undefined
    const targets = [...(product ? [{ url: product, label: 'Product page' as const }] : []), { url: home, label: 'Homepage' as const }]
    const pages: IAiView['pages'] = []
    for (const t of targets) {
        try {
            const raw = t.url === home && homeHtml ? homeHtml : await fetchRaw(t.url)
            const shopperHtml = await render(t.url).catch(() => null)
            const ai = extractPageFacts(raw)
            pages.push({
                ...t,
                rows: compareFacts(ai, shopperHtml ? extractPageFacts(shopperHtml) : null),
                aiPreview: ai.preview,
                ...(shopperHtml ? {} : { error: "Couldn't load the page like a shopper" })
            })
        } catch (err) {
            pages.push({ ...t, rows: [], aiPreview: '', error: `Couldn't open ${t.url} (${(err as Error).message})` })
        }
    }
    return { checkedAt: new Date(), pages }
}
```
with the `IAiView` interface exported and imports `axios`, `{ auditService, productLinksIn } from './auditService'`, `{ withBrowser } from './reportService/pdfService'`.

- [ ] **Step 3:** In `auditModel.ts` add `aiView: { type: mongoose.Schema.Types.Mixed, default: null }`. In `auditTypes.ts` add `aiView?: unknown` to `IAuditData`. In `auditController.ts` add `runAiView` (same brand and org checks as `rescanBrandAudit`: load the brand, `const aiView = await runAiView(brand.website)`, `await auditModel.updateOne({ brandId }, { $set: { aiView } }, { upsert: true })`, respond `{ aiView }`). Route: `router.route('/brands/:id/audit/ai-view').post(authentication, auditController.runAiView)`.

- [ ] **Step 4:** `tsc --noEmit`, eslint, and the Task 1 check still pass. A manual `ts-node` one-off that calls `runAiView('https://hasanoud.com')` prints the product page plus homepage with nothing missing (Shopify renders server-side).
- [ ] **Step 5: Commit** `feat(ai-view): api that compares ai crawler and shopper views`

### Task 3: Website audit panel, signup label

**Files:**
- Create: `frontend/src/components/AiViewPanel.tsx`
- Modify: `frontend/src/pages/WebsiteAudit.tsx`, `frontend/src/pages/Signup.tsx`

- [ ] **Step 1:** `AiViewPanel.tsx`:
```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/axios';
import ScanProgress from './ScanProgress';
import { timeAgo } from '../utils/timeAgo';

interface Row { key: string; label: string; ai: string | null; shopper: string | null; missingForAi: boolean }
interface AiViewPage { url: string; label: string; rows: Row[]; aiPreview: string; error?: string }
export interface AiView { checkedAt: string; pages: AiViewPage[] }

const cell = (v: string | null, bad: boolean) =>
  v ? <span>✓ {v}</span> : <span style={{ color: bad ? 'var(--bad)' : 'var(--text-dim)' }}>✗ missing</span>;

export default function AiViewPanel({ brandId, initial }: { brandId?: string; initial?: AiView | null }) {
  const [view, setView] = useState<AiView | null>(initial ?? null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!brandId || running) return;
    setRunning(true);
    setError(null);
    try {
      const res = await api.post(`/brands/${brandId}/audit/ai-view`);
      setView(res.data?.data?.aiView ?? null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'The comparison failed. Please try again.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="panel">
      <h3>What AI crawlers see</h3>
      <p className="sub">ChatGPT's and Claude's crawlers read your page's raw HTML and don't run JavaScript. Anything that only appears after JavaScript is invisible to them.</p>
      {running && <ScanProgress title="Comparing AI and shopper views" hint="Opening your product page and homepage as GPTBot and as a shopper. This takes up to a minute." />}
      {error && <p style={{ color: 'var(--bad)', fontSize: '13px' }}>{error}</p>}
      {!running && view?.pages.map((p) => {
        const missing = p.rows.filter((r) => r.missingForAi).map((r) => r.label.toLowerCase());
        return (
          <div key={p.url} style={{ marginTop: '16px' }}>
            <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{p.label} <span className="mono" style={{ color: 'var(--text-dim)', fontWeight: 400 }}>{p.url}</span></div>
            {p.rows.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Fact</th><th>AI crawler</th><th>Shoppers</th></tr></thead>
                  <tbody>{p.rows.map((r) => (
                    <tr key={r.key}><td>{r.label}</td><td>{cell(r.ai, r.missingForAi)}</td><td>{p.error ? '—' : cell(r.shopper, false)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {p.error && <p style={{ color: 'var(--text-dim)', fontSize: '13px' }}>{p.error}</p>}
            {!p.error && (missing.length
              ? <p style={{ color: 'var(--bad)', fontSize: '13.5px' }}>AI can't see the {missing.join(', ')} on this page: they load with JavaScript. <Link to="/recommendations">What to do →</Link></p>
              : <p style={{ color: 'var(--good)', fontSize: '13.5px' }}>AI crawlers see everything shoppers see on this page ✓</p>)}
            {p.aiPreview && <p className="mono" style={{ fontSize: '12px', color: 'var(--text-dim)' }}>What the AI reads first: “{p.aiPreview}…”</p>}
          </div>
        );
      })}
      <div style={{ marginTop: '14px', display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'flex-end' }}>
        {view && <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Checked {timeAgo(view.checkedAt) ?? ''}</span>}
        <button type="button" className="btn" onClick={run} disabled={running || !brandId}>{view ? 'Compare again' : 'Compare'}</button>
      </div>
    </div>
  );
}
```
- [ ] **Step 2:** In `WebsiteAudit.tsx` add `aiView?: AiView | null` to `AuditData`, import `AiViewPanel, { type AiView }`, and render `<AiViewPanel key={activeBrandId} brandId={activeBrandId} initial={auditData?.aiView} />` after the top cards row (before the next panel).
- [ ] **Step 3:** In `Signup.tsx`, change the middle scanner label `GEMINI` (on the `var(--gpt)` dot) to `GPT`.
- [ ] **Step 4:** `npm run build` passes; oxlint has no new warnings except the known effect pattern.
- [ ] **Step 5: Commit** `feat(ai-view): website audit panel, fix signup scanner label`

### Task 4: Verify, PR, staging, Test Sheet

- [ ] Once the QA agent is done with the browser: start the backend locally (email off), log in a local test user with a hasanoud.com brand, click Compare, and check the panel, the progress and the result (nothing missing). Then intercept the API to return a fixture with `missingForAi` rows, and check the red ✗ and the warning line. Check the signup label reads CLAUDE / GPT / GEMINI.
- [ ] Delete the test data and stop the servers. Push, open the PR, wait for green checks, and hand over the merge command. After the merge: deploy staging, and add Test Sheet feature `N4` with positive and negative cases.
