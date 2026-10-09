# Where AI Reads (Citations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A weekly Gemini + Google Search check of each paid brand's buyer questions that lists the pages AI reads and the pages naming competitors but not the brand.

**Architecture:** Pure helpers in `citationService.ts` (question picking, URL cleaning, page types, brand matching, outreach/top sources/own-site/email line). `runCitationScan(brandId, deps?)` calls a new `aiService.callGeminiGrounded`, reads each page with `fetchPublicText`, and saves a `citationRun` per ISO week. A Sunday 22:00 IST cron queues jobs on a new `citation-scan` queue; the first normal scan of a brand also queues one. `GET /brands/:id/citations` feeds a "Where AI reads" section on Competitors and an Overview card; `weeklyReport.ts` adds one line.

**Tech Stack:** Express + Mongoose + BullMQ (TypeScript), React 19 + Vite.

**Spec:** `docs/superpowers/specs/2026-10-09-citations-design.md`

## Global Constraints

- Model `gemini-3.8-flash`, `tools: [{ google_search: {} }]`, `thinkingConfig: { thinkingLevel: 'minimal' }`, `maxOutputTokens: 400`, 120 s timeout; every call through `aiFetch('GEMINI', …)` and `recordAiUsage` inside `withAiCallContext({ brandId, purpose: 'citations' })`.
- Questions per run: free 0, starter 5, growth 10, agency 20; lost questions first (latest scan named a tracked competitor, not the brand), then saved order.
- One run per brand per ISO week; last 8 runs kept; runs deleted with the brand.
- Redirect resolve: HEAD, `redirect: 'manual'`, 5 s timeout. Strip `utm_*` params and `#fragment`. Pages via `fetchPublicText` (existing, SSRF-safe).
- Marketplace domains: amazon, flipkart, nykaa, myntra, meesho, 1mg, jiomart, ajio, tatacliq, purplle, snapdeal. Video: youtube.com, youtu.be.
- Outreach: competitor on page, brand not, not own/competitor site; order cited-in desc, competitors desc, article/video before marketplace; 20 rows then "Show more".
- Switch: env `CITATIONS_ENABLED` (default `true`); `false` → cron queues nothing and the first-run trigger does nothing.
- Screen copy says "Gemini with Google Search" and "AI also reads other sources; this is one engine's view."
- No new dependencies. Checks in `backend/src/checks/`, no network. Commits under the user's name only, no Claude trailers.

## Review Focus

- A source URL that resolves to a private/internal address → `fetchPublicText` refuses it; the page falls back to "from AI answer", the run carries on (Task 2).
- Every Gemini call fails (429 quota) → run saved `failed`, API serves the last `ok` run with `failedLatest: true` (Task 2, Task 4).
- Brand with no `lastScanId` yet (no normal scan) → questions in saved order, no crash (Task 1).
- The same page cited under two URLs differing only by `utm_*` or `#…` → one row with both questions (Task 1).
- Brand website stored with/without `www.` or trailing path → own-site detection still matches (Task 1).

---

### Task 1: Pure helpers

**Files:** create `backend/src/service/citationService.ts`, `backend/src/checks/citations.check.ts`.

**Produces:**
```ts
export type PageType = 'marketplace' | 'video' | 'own' | 'competitor' | 'article'
export interface ICitedPage { url: string; domain: string; title: string; type: PageType; citedIn: string[]; brands: string[]; brandFound: boolean; readFrom: 'page' | 'answer' }
export const CITATION_QUESTIONS: Record<PlanName, number>              // free 0, starter 5, growth 10, agency 20
export const pickQuestions = (queries: string[], latest: Array<{ queryText: string; mentioned: boolean; brandsNamed?: Array<{ name: string }> }>, tracked: string[], limit: number): string[]
export const cleanUrl = (url: string): string                           // drop utm_*, fragment; keep the rest
export const domainOf = (url: string): string                           // hostname without "www."
export const pageType = (url: string, ownSite: string, competitorSites: string[]): PageType
export const brandsOnText = (text: string, names: Array<{ name: string; aliases?: string[] }>): string[]  // nameMatcher + no-space form
export const buildOutreach = (pages: ICitedPage[], previousUrls: Set<string>): Array<ICitedPage & { isNew: boolean; tip: string }>
export const topSources = (pages: ICitedPage[]): Array<{ domain: string; count: number }>   // count = sum of citedIn, top 10
export const ownSiteLine = (pages: ICitedPage[], questions: number): { own: number; topCompetitor: { name: string; count: number } | null }
export const citationEmailLine = (outreach: ReturnType<typeof buildOutreach>): string | null
```
- Reuse `nameMatcher`, `brandKey` from `competitorService.ts`.
- [ ] Write the check with fixtures: lost questions first and cap; no latest scan → saved order; `cleanUrl('https://x.in/a?utm_source=openai&id=2#top')` → `https://x.in/a?id=2`; duplicates merged by cleaned URL (merge happens in Task 2, but `cleanUrl` equality is asserted here); `domainOf('https://www.lbb.in/all')` → `lbb.in`; types (flipkart → marketplace, youtube → video, `hasanoud.com` vs website `https://www.hasanoud.com/` → own); `brandsOnText` finds "AdilQadri" for "Adil Qadri" and an alias; outreach filter/order/isNew/tip; topSources counts; ownSiteLine; email line text "Top source to reach this week: lbb.in — Best attars (names Ajmal; not you)" and null for an empty list.
- [ ] Run → FAIL → implement → PASS (`NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/citations.check.ts`) → tsc, eslint → commit `feat(citations): helpers for sources, outreach and own site`.

### Task 2: Gemini grounded call, run and storage

**Files:** create `backend/src/model/citationRunModel.ts`, `backend/src/types/citationTypes.ts`; modify `backend/src/service/aiService.ts` (add `callGeminiGrounded`), `backend/src/service/citationService.ts` (add `runCitationScan`); extend `citations.check.ts`.

**Produces:**
```ts
// aiService
callGeminiGrounded: (prompt: string) => Promise<{ text: string; sources: Array<{ title: string; uri: string }>; supports: Array<{ text: string; chunks: number[] }> } | null>
// citationService
export interface ICitationDeps { grounded?: typeof aiService.callGeminiGrounded; resolve?: (uri: string) => Promise<string>; fetchText?: (url: string) => Promise<string>; now?: Date }
export const isoWeek = (d: Date) => string                              // reuse schedulerService's if exported, else move it to util
export const runCitationScan = (brandId: string, deps?: ICitationDeps) => Promise<'ok' | 'failed' | 'skipped'>
```
- Model: fields per spec §2, unique index `{ brandId: 1, week: 1 }`. `runCitationScan`: skip if a run for this week exists; plan → limit (0 → `skipped`); create `running`; per question call `grounded` (null → `{ ok: false }`); resolve + clean + merge pages; read each page once (`fetchText` with 10 s; on error use `supports` text for brands, `readFrom: 'answer'`); save `ok` (or `failed` if every question failed); delete runs beyond the last 8.
- [ ] Check with stub deps: all-fail → `failed`; private URL fetch throws → `readFrom: 'answer'`; second call same week → `skipped`, no new doc; 9th run prunes the oldest (needs local Mongo: put these in `citationRun.check.ts`, with `process.exit(0)` at the end).
- [ ] tsc, eslint → commit `feat(citations): weekly run with gemini and google search`.

### Task 3: Queue, schedule, first run, cleanup

**Files:** modify `backend/src/service/queueService.ts` (`citationQueue`, `enqueueCitationJob(brandId, week)` with `jobId` `citations-<brandId>-<week>`), `backend/src/service/workerService.ts` (worker, concurrency 1; after a scan job, queue a first run when the brand has no `citationRun`), `backend/src/service/schedulerService.ts` (`citation-tick` cron `0 22 * * 0` IST → paid brands), `backend/src/config/config.ts` (`CITATIONS_ENABLED`), `backend/src/controller/brandController.ts` (`deleteBrand` removes runs).
- [ ] tsc, eslint, all checks → commit `feat(citations): sunday schedule and first run after the first scan`.

### Task 4: API and screens

**Files:** modify `backend/src/router/apiRouter.ts` (`GET /brands/:id/citations`), `backend/src/controller/brandController.ts` (`getCitations`: `ensureUserOrg`, plan; free → `{ locked: true }`; latest run, last `ok` run, previous `ok` run for New); create `frontend/src/components/Citations.tsx` (`CitationsSection`, `CitationsCard`); modify `frontend/src/pages/Competitors.tsx` (below `LostToSection`), `frontend/src/pages/Overview.tsx` (card after `FixImpactCard`).
- Response: `{ locked?: true, run: { week, status, checkedAt, questions, failed } | null, failedLatest?: boolean, outreach, topSources, ownSite, counts: { questions, failed, pages, read }, newCount }`.
- Section and card per spec §4 (states: none, running, failed latest, free lock).
- [ ] Frontend build + oxlint, backend tsc → commit `feat(citations): where AI reads on competitors and overview`.

### Task 5: Monday email line

**Files:** modify `backend/src/service/reportService/weeklyReport.ts` (`renderWeeklyEmail(d, unsubscribe, fixLine?, citationLine?)`; `sendWeeklyReport` loads the latest `ok` run and builds the line via `buildOutreach` + `citationEmailLine`, in try/catch); extend `citations.check.ts` (renders with and without the line, escaped in HTML).
- [ ] Check → commit `feat(citations): top source line in the monday email`.

### Task 6: Verify and release

- [ ] Fresh reviewer on the branch, fixes, PR, staging, Test Sheet N11 (+ve/−ve), staging tester agent. One real run needs a Gemini key on staging (user adds it) or the user's go-ahead on production. Add the `gemini-3.8-flash` price on the AI Models admin page so `costLog` shows real cost.
