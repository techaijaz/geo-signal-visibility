# Store Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Score every product page (and check a few collection pages) for AI-readiness, with a fix per gap, shown on the Website audit and the Products page.

**Architecture:** A new `storeAuditService.ts` holds pure scoring (built on `extractPageFacts` from the AI view) and page discovery with an injectable fetcher; `runStoreAudit` fetches pages two at a time through `fetchPublicText` and saves `audit.storeAudit`. It runs at the end of the website audit and from `POST /brands/:id/audit/store`. React gets a `StoreAuditPanel` and an "AI-ready" column.

**Tech Stack:** Express + Mongoose (TypeScript), cheerio, React 19 + Vite.

**Spec:** `docs/superpowers/specs/2026-10-07-store-audit-design.md`

## Global Constraints

- No new dependencies. No AI calls.
- Every page fetch goes through `fetchPublicText` (`backend/src/util/publicUrl.ts`); URLs must be on the brand's own host.
- Weights: Product schema 25, Price 20, Reviews 15, Description 15, FAQ 10, Image alt 10 (partial: `round(10 * withAlt / total)`, pass at 80%+), Title and meta 5. Level: good ≥80, warn 50–79, bad <50.
- Pages: saved products up to `maxProducts`; else sitemap; else homepage links. Collections: up to 5.
- Fetch 2 pages at a time, 10 s timeout; one failure never stops the rest.
- The button counts against the daily audit re-scan quota (`consumeDailyRescan(brandId, 'audit', …)`).
- Checks: assert scripts in `backend/src/checks/`, run with `NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/<file>.ts`, no network.
- Commits under the user's name only, no Claude trailers.

## Review Focus

- A product page that returns HTML with no `<body>` text or a 404 page → row with an error or a low score, never a crash (Task 2 check: fetcher throws for one URL).
- A sitemap index whose product sitemap is itself an index or missing → falls back to homepage links (Task 2 check).
- Saved products whose URL is on another host (manual product with a marketplace link) → skipped, not fetched (Task 2 check).
- A store with 0 images on a page → alt check passes with "no images" and full points, not a division by zero (Task 1 check).
- A store audit that throws inside the website audit → the website audit still saves (Task 3: wrapped in try/catch, logged).

---

### Task 1: Scoring (pure)

**Files:** Create `backend/src/service/storeAuditService.ts`, `backend/src/checks/storeAudit.check.ts`.

**Interfaces — Produces:**
```ts
export interface IStoreCheck { key: 'schema' | 'price' | 'reviews' | 'description' | 'faq' | 'alt' | 'meta'; label: string; pass: boolean; points: number; max: number; detail: string; tip?: string }
export interface IStorePage { url: string; name: string; kind: 'product' | 'collection'; score: number | null; level: 'good' | 'warn' | 'bad' | null; checks: IStoreCheck[]; error?: string }
export const scoreProductPage = (html: string, url: string, shopify: boolean): IStorePage
export const scoreCollectionPage = (html: string, url: string, shopify: boolean): IStorePage
```

- [ ] Step 1: failing check covering: a Shopify-like page with Product+Offer+AggregateRating+FAQPage JSON-LD, 60-word description, 4/4 alt, good title/meta → score 100, level good; a bare JS shell → score ≤ 15, level bad, tips on failed checks; alt 3/8 → 4 points, fail, detail "3 of 8 images have alt text"; 0 images → 10 points, pass, "No images"; FAQ via two "…?" headings → pass; collection page checks (3) with `score: null`.
- [ ] Step 2: run → "Cannot find module".
- [ ] Step 3: implement (meta/title readers with cheerio; description words from main content as in `extractPageFacts`; tips per key with a Shopify sentence).
- [ ] Step 4: run → PASS; tsc, eslint.
- [ ] Step 5: commit `feat(store-audit): score product and collection pages`.

### Task 2: Pages and run (fetcher injected)

**Interfaces — Produces:**
```ts
export const productUrlsFromSitemap = (xml: string, origin: string): { products: string[]; nested: string[] }
export const collectionUrlsFromJson = (json: string, origin: string): string[]
export const choosePages = (args: { origin: string; saved: string[]; max: number; fetchText: (url: string) => Promise<string> }): Promise<{ source: 'products' | 'sitemap' | 'homepage'; products: string[]; collections: string[] }>
export interface IStoreAudit { checkedAt: Date; source: 'products' | 'sitemap' | 'homepage'; score: number | null; pages: IStorePage[] }
export const runStoreAudit = (website: string, saved: Array<{ url: string; shortName: string }>, max: number, fetchText?: (url: string) => Promise<string>): Promise<IStoreAudit>
```

- [ ] Step 1: failing checks: sitemap index → nested `sitemap_products_1.xml` → product URLs (own host only); no sitemap → homepage links; saved products take priority and other-host URLs are dropped; `/collections.json` → up to 5 handles minus `all`/`frontpage`; one URL throwing → that page has `error`, others scored; store score = average of scored product pages; pages sorted weakest first.
- [ ] Step 2: run → fail. Step 3: implement (concurrency 2; `openError` for errors; names from saved shortName, else `<h1>`/title). Step 4: PASS. Step 5: commit `feat(store-audit): choose pages and run the store audit`.

### Task 3: Save, run with the website audit, API

**Files:** `auditModel.ts` (+`storeAudit: Mixed, default null`), `auditTypes.ts` (+`storeAudit?: unknown`), `auditService.ts` (end of `runRealAudit`: load brand + plan limits, `runStoreAudit`, set `storeAudit`, try/catch + log), `auditController.ts` (+`runStoreAudit` handler: org/brand checks, quota via `consumeDailyRescan(brandId, 'audit', perDay)` → 429, run, `updateOne({ brandId }, { $set: { storeAudit } })` without upsert, respond `{ storeAudit }`), `apiRouter.ts` (`POST /brands/:id/audit/store`), `productController.getVisibility` (+`aiReady` per row: score of the store page whose URL equals the product URL, else null).

- [ ] Steps: tsc, eslint, all checks PASS; manual local call of `runStoreAudit('https://hasanoud.com', [], 3)` prints 3 product pages + collections with scores. Commit `feat(store-audit): run with the website audit and from the audit page`.

### Task 4: Screens

**Files:** Create `frontend/src/components/StoreAuditPanel.tsx`; modify `WebsiteAudit.tsx` (render after AiViewPanel with `initial={auditData?.storeAudit}`), `ProductVisibility.tsx` (column "AI-ready": pill with `r.aiReady`, "—" when null).

- [ ] Panel: store score pill ("Store AI-readiness 64/100"), "Audit product pages" button + ScanProgress, product table (name, score pill, ✓/✗ per check) weakest first, row opens to details + tips, collections table, error rows, empty state. Opened details sized to the table box (same pattern as ProductVisibility). Build passes. Commit `feat(store-audit): product pages panel and ai-ready column`.

### Task 5: Verify, PR, staging, Test Sheet

- [ ] Final review (fresh reviewer), local QA agent, PR, staging deploy, Test Sheet feature N8 cases, staging tester agent.
