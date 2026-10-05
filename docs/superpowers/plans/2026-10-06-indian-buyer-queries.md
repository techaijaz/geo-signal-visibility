# Indian Buyer Queries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace generic template queries with real Indian buyer questions (Hinglish, rupee budget, occasion), and let a brand ask the AI for more of them.

**Architecture:** Curated per-vertical templates move from the frontend into a backend service (`querySuggestionService.ts`) that is the one source of templates. A `GET /queries/templates` endpoint feeds onboarding and Settings. A `POST /brands/:id/query-suggestions` endpoint makes one cheap AI call through `aiService.callAnyAvailableAi`, logged under cost purpose `'queries'`, validated by a pure `cleanSuggestions`, and capped at 10 calls per brand per day.

**Tech Stack:** Express + Mongoose (TypeScript, ts-node), React 19 + Vite, existing `aiService.callAnyAvailableAi` and `withAiCallContext`.

**Spec:** `docs/superpowers/specs/2026-10-06-indian-buyer-queries-design.md`

## Global Constraints

- No new dependencies, no infra or deploy changes.
- The backend has no test runner: checks are `assert` scripts under `backend/src/checks/`, run with `NODE_ENV=development npx ts-node --transpile-only src/checks/<file>.ts`. This check needs no DB and no real AI (stub `aiService.callAnyAvailableAi`), and ends with `process.exit(0)`.
- Local runs: blank `SMTP_USER= SMTP_PASS= EMAIL_SERVICE_API_KEY= RESEND_API_KEY=`; never send email.
- Suggestions are never saved by the server; the plan limit stays enforced by `PATCH /brands/:id`.
- Commits under the user's name, no AI trailers.

## Review Focus

- The AI returns the brand name, duplicates of existing queries, URLs or essays → dropped (Task 2 check).
- The AI returns broken JSON or no provider is configured → `[]`, no throw (Task 2 check).
- Free plan (3 queries): the first 3 templates are a Hinglish price, a Hinglish occasion and an English best-of question (Task 1 check).
- An admin-made category ("Attar", "Perfume & Deo") still gets fragrance templates (Task 1 check).
- Another org's brand id on `POST /brands/:id/query-suggestions` → 404 (same org check as `/lost-to`).

---

### Task 1: Curated templates

**Files:**
- Create: `backend/src/service/querySuggestionService.ts`
- Create: `backend/src/checks/indianQueries.check.ts`

**Interfaces:**
- `type QueryLang = 'EN' | 'HI-EN'`; `type QueryIntent = 'Best-of' | 'Price' | 'Occasion' | 'Comparison' | 'Direct' | 'How-to'`
- `interface ISuggestedQuery { text: string; lang: QueryLang; intent: QueryIntent }`
- `detectVertical(category: string): Vertical`
- `templateQueries(category: string, brandName?: string): ISuggestedQuery[]`

- [ ] **Step 1:** Write the check for `detectVertical` and `templateQueries` (see spec, Testing). Run it; it fails with "Cannot find module '../service/querySuggestionService'".
- [ ] **Step 2:** Write the service: keyword rules per vertical (first match wins, fragrance first), one ordered list per vertical, the generic list built from the category name, the branded question appended last when a brand name is given.
- [ ] **Step 3:** Run the check; it passes.
- [ ] **Step 4:** Commit `feat(queries): indian buyer query templates per category`.

### Task 2: AI suggestions with validation

**Files:**
- Modify: `backend/src/service/querySuggestionService.ts`
- Modify: `backend/src/model/costLogModel.ts`, `backend/src/service/costLogService.ts` (purpose `'queries'`)
- Modify: `backend/src/checks/indianQueries.check.ts`

**Interfaces:**
- `detectLang(text: string): QueryLang`
- `cleanSuggestions(raw: unknown, brandName: string, existing: string[]): ISuggestedQuery[]`
- `suggestQueries(brand: { name; website?; category; region? }, existing: string[]): Promise<ISuggestedQuery[]>` (caller wraps it in `withAiCallContext`)

- [ ] **Step 1:** Extend the check: `detectLang`, `cleanSuggestions` (brand name, duplicates incl. existing, URL, too long, too short, bad lang/intent repaired, cap 12, non-array), `suggestQueries` with `aiService.callAnyAvailableAi` stubbed to good JSON, to junk and to `null`. Run; it fails.
- [ ] **Step 2:** Implement. Parse the first JSON array in the reply; accept plain strings too.
- [ ] **Step 3:** Run the check; it passes. Commit `feat(queries): ai suggestions for indian buyer queries`.

### Task 3: API

**Files:**
- Create: `backend/src/controller/queryController.ts`
- Modify: `backend/src/router/apiRouter.ts`
- Modify: `backend/src/service/aiService.ts` (scan fallback for e-commerce uses `templateQueries`)

- [ ] `GET /queries/templates?category=&brand=` → `{ vertical, queries }`.
- [ ] `POST /brands/:id/query-suggestions` → org check via `ensureUserOrg` + `findBrandByIdAndOrgId`; count `costLogModel` rows `{ brandId, purpose: 'queries', createdAt > now-24h }`, ≥ 10 → 429; else `withAiCallContext({ brandId, purpose: 'queries' }, () => suggestQueries(...))`; empty → `message`.
- [ ] `npx tsc --noEmit -p .` and eslint pass. Commit `feat(queries): templates and ai suggestion api`.

### Task 4: Screens

**Files:**
- Modify: `frontend/src/pages/Onboarding.tsx`, `frontend/src/pages/Settings.tsx`, `frontend/src/index.css` (tags `tag-price`, `tag-occasion`)
- Create: `frontend/src/utils/queryTemplates.ts` (types + `fetchQueryTemplates`)
- Delete: `frontend/src/utils/categoryQueryGenerator.ts`
- Modify: default category lists (backend seed, `script/seed-categories.js`, frontend fallback lists) to add "Fragrances & Perfumes"

- [ ] Onboarding step 3 loads templates from the API (on category/brand change, debounced), keeps `queriesWithinPlan`, shows an error line on failure.
- [ ] Settings "+ Auto-suggest" uses the API; new "✨ Suggest with AI" button with an Add list.
- [ ] `npm run build` passes. Commit `feat(queries): hinglish templates in onboarding and ai suggestions in settings`.

### Task 5: Verify and hand over

- [ ] Run the check, `tsc`, eslint and the frontend build once more.
- [ ] Browser check with email off (onboarding fragrance list, Suggest with AI, plan limit) and Test Sheet cases: after review, by the user or QA.
