# Product Feed Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Score every Shopify product's data against OpenAI's product feed rules and show the gaps on the Products page.

**Architecture:** A pure `feedHealthService.ts` turns Shopify `products.json` items into per-product checks and a store summary; `runFeedHealth(website, fetchText?)` reuses `fetchShopifyProducts`. Saved on `audit.feedHealth`, run after the website audit and from `POST /brands/:id/products/feed`. React gets a `FeedHealthPanel` on the Products page, a "Feed" column and a line on the Website audit.

**Tech Stack:** Express + Mongoose (TypeScript), React 19 + Vite.

**Spec:** `docs/superpowers/specs/2026-10-07-feed-health-design.md`

## Global Constraints

- No new dependencies, no AI calls, all fetches through `fetchShopifyProducts` (→ `fetchPublicText`).
- Weights: Description 25, Title 15, Brand 10, Main image 10, Extra images 10, Price 10, Stock 10, Category 10, GTIN 0 ("Connect Shopify to check"). Levels 80 / 50.
- Description: plain text from `body_html`, 50+ words, ≤5,000 characters. Title 15–150 characters, not all capitals. Image JPEG/PNG by extension. Price > 0 and compare-at empty or higher. Stock: any variant available. Category: product_type set and not a placeholder.
- Button: at most once per 10 minutes per brand (returns the saved result otherwise); no daily quota.
- Checks: assert scripts in `backend/src/checks/`, no network. Commits under the user's name only, no Claude trailers.

## Review Focus

- `body_html` with only images/HTML and no text → description fails with "0 words", no crash (Task 1).
- A product with no variants or no images array → checks fail cleanly (Task 1).
- 1000 products → summary and table stay fast; the panel pages 50 rows at a time (Task 1 summary on 1000 items; Task 3 paging).
- Non-Shopify store → `shopify: false`, panel message, no error (Task 2).
- The feed run throwing inside the website audit → the audit still saves (Task 2).

---

### Task 1: Scoring and summary (pure)

**Files:** create `backend/src/service/feedHealthService.ts`, `backend/src/checks/feedHealth.check.ts`.

**Produces:**
```ts
export interface IFeedCheck { key: 'description' | 'title' | 'brand' | 'image' | 'images' | 'price' | 'stock' | 'category' | 'gtin'; label: string; pass: boolean | null; points: number; max: number; detail: string; tip?: string }
export interface IFeedProduct { url: string; name: string; score: number; level: 'good' | 'warn' | 'bad'; checks: IFeedCheck[] }
export interface IFeedHealth { checkedAt: Date; shopify: boolean; total: number; score: number | null; summary: Array<{ key: IFeedCheck['key']; label: string; failing: number }>; products: IFeedProduct[] }
export const scoreFeedProduct = (raw: unknown, origin: string): IFeedProduct | null
export const summarizeFeed = (products: IFeedProduct[], shopify: boolean): IFeedHealth
export const feedScoreFor = (url: string, feed: IFeedHealth | null | undefined): number | null
```
- [ ] Failing check → implement → PASS → commit `feat(feed-health): score shopify products against the feed rules`.

### Task 2: Run, save, API

- `runFeedHealth(website, fetchText?)` → `summarizeFeed(products.map(scoreFeedProduct))`, `shopify:false` when not a store.
- `auditModel.feedHealth` (Mixed), `auditTypes.feedHealth?`; end of `runRealAudit` (after store audit, guarded, skipped when the homepage failed).
- `POST /brands/:id/products/feed` in `productController` (org/brand checks; if saved `checkedAt` < 10 min ago return it; else run, `updateOne` without upsert, respond `{ feedHealth, saved }`).
- `getVisibility` rows get `feed: feedScoreFor(r.url, audit.feedHealth)`.
- [ ] Check with a stubbed fetcher (non-Shopify, store) → tsc, eslint, all checks → commit `feat(feed-health): run with the audit and from the products page`.

### Task 3: Screens

- `frontend/src/components/FeedHealthPanel.tsx`: score pill, top gaps ("125 of 203 products have no category"), "Check feed" button, search, table weakest first paged 50, details + fixes, non-Shopify message.
- `pages/Products.tsx`: render the panel above `ProductsTable` (loads `GET /brands/:id/audit` for the saved result).
- `ProductVisibility.tsx`: "Feed" column.
- `WebsiteAudit.tsx`: one line "Product feed: N/100 → see Products" when `auditData.feedHealth` exists.
- [ ] Build → commit `feat(feed-health): feed health panel, feed column and audit line`.

### Task 4: Verify and release

- [ ] Fresh reviewer, local QA agent, fixes, PR, staging, Test Sheet N9, staging tester.
