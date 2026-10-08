# Fix Impact (Before/After) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record when recommended work gets done and show the AI visibility before and after it, on Recommendations, Overview and in the Monday email.

**Architecture:** A new `fixEvent` collection is written when a recommendation is ticked/unticked and when the audit auto-resolves one. A pure `fixImpactService.ts` groups events and compares per-engine visibility from `mentions` in the before (14 days) and after (7–30 days) windows; `GET /brands/:id/fix-impact` serves it. React gets a `FixImpactSection` on Recommendations and a card on Overview; `weeklyReport.ts` adds one line for a final, positive, not-yet-emailed group.

**Tech Stack:** Express + Mongoose (TypeScript), React 19 + Vite.

**Spec:** `docs/superpowers/specs/2026-10-08-fix-impact-design.md`

## Global Constraints

- No new dependencies, no AI calls. Wording is always "after", never "because of".
- Groups: an event within 7 days of the group's **first** event joins it (no chaining).
- Windows: before = 14 days before the group's first event; after = 7 to 30 days after the group's last event.
- Only engines present in both windows count; total = average of those engines; delta = after − before (points).
- States: `no-before` (0 before scans), `measuring` (<2 after scans, <30 days), `interim` (2+ after scans, <30 days), `final` (30 days passed, 2+ after scans), `no-after` (30 days passed, <2 after scans).
- Result: delta > 3 → `up`; −3..3 → `flat`; < −3 → `down`.
- Overview card and email: only `up`. Email: only `final` + `up` + not emailed, best one, then `emailedAt` set.
- Event writes never block the toggle or the audit (log and carry on). Brand delete removes its events.
- Checks: assert scripts in `backend/src/checks/`, no network. Commits under the user's name only, no Claude trailers.

## Review Focus

- Tick, untick, tick again on one recommendation → exactly one open event (Task 2).
- Audit resolving a recommendation the user already ticked → no second event, existing one becomes `verified`, `doneAt` unchanged (Task 2).
- A plan upgrade adding Perplexity between windows → Perplexity ignored in the total (Task 1).
- A brand with events but whose scans stopped → `no-after` after 30 days, never stuck on "measuring" (Task 1).
- Recommendation rescan deleting all recommendations → the section still lists past groups (Task 3, events not recommendations).

---

### Task 1: Event model and impact calculation (pure)

**Files:** create `backend/src/model/fixEventModel.ts`, `backend/src/types/fixEventTypes.ts`, `backend/src/service/fixImpactService.ts`, `backend/src/checks/fixImpact.check.ts`.

**Produces:**
```ts
// types/fixEventTypes.ts
export type FixSource = 'user' | 'audit'
export interface IFixEvent { _id?: unknown; brandId: unknown; recommendationId: unknown; text: string; category: string; source: FixSource; verified: boolean; doneAt: Date; undoneAt?: Date | null; emailedAt?: Date | null }

// service/fixImpactService.ts
export interface IScanPoint { scannedAt: Date; models: Array<{ name: string; score: number }> }   // same shape as getVisibilityTrendByBrandId items
export type FixState = 'no-before' | 'measuring' | 'interim' | 'final' | 'no-after'
export interface IFixGroup {
  start: Date; end: Date
  fixes: Array<{ text: string; category: string; verified: boolean; doneAt: Date }>
  eventIds: string[]
  verified: boolean; emailed: boolean
  state: FixState; daysLeft?: number
  before?: number; after?: number; delta?: number
  result?: 'up' | 'flat' | 'down'
  engines?: Array<{ name: string; before: number; after: number }>
}
export const groupFixEvents = (events: IFixEvent[]): IFixEvent[][]          // open events only, oldest first
export const measureGroup = (group: IFixEvent[], scans: IScanPoint[], now: Date, scanIntervalHours: number): IFixGroup
export const pickEmailGroup = (groups: IFixGroup[]): IFixGroup | null      // final + up + !emailed, biggest delta
export const pickOverviewGroup = (groups: IFixGroup[], now: Date): IFixGroup | null   // up (interim|final) in last 60 days, biggest delta
export const loadScanPoints = (brandId: string, from: Date, to: Date): Promise<IScanPoint[]>   // mentions aggregation, same math as getVisibilityTrendByBrandId
export const getFixImpact = (brandId: string, plan: PlanName, now?: Date): Promise<IFixGroup[]>  // newest first; events from the last 120 days
```
- Model: fields per spec, `timestamps: true`, index `{ brandId: 1, doneAt: -1 }` and `{ brandId: 1, recommendationId: 1 }`.
- `daysLeft` for `measuring`: days until (last event + 7 days + 2 × scan interval), at least 1.
- [ ] Write `fixImpact.check.ts` with crafted events/scans: grouping (day 0, 6 → one group; day 0, 6, 12 → two groups, no chaining), undone events dropped, windows (scan on day −15 ignored, day −1 counted; after scan on day +6 ignored, +7 counted, +31 ignored), engine only in after window ignored, each of the 5 states, delta bands (+4 up, +3 flat, −3 flat, −4 down), `pickEmailGroup` skips emailed/interim/flat, `pickOverviewGroup` skips groups older than 60 days.
- [ ] Run → FAIL → implement → PASS (`NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/fixImpact.check.ts`) → tsc, eslint → commit `feat(fix-impact): fix events and before/after calculation`.

### Task 2: Recording events

**Files:** create `backend/src/service/fixEventService.ts`; modify `backend/src/controller/recommendationController.ts` (`toggleRecommendation`), `backend/src/service/auditService.ts` (~line 575, the `resolvedIds` block), `backend/src/controller/brandController.ts` (`deleteBrand`); extend `fixImpact.check.ts` or add `fixEvent.check.ts` (needs local Mongo, like `recommendations.check.ts`).

**Produces:**
```ts
export const recordDone = (rec: { _id; brandId; text; category }, source: FixSource, at?: Date): Promise<void>   // no-op if an open event exists for rec; audit + open user event → verified: true
export const recordUndone = (recId: string): Promise<void>                    // sets undoneAt on the open event
export const deleteBrandFixEvents = (brandId: string): Promise<void>
```
- Every function catches and logs (`logger.error('[FixEvent] …')`), never throws.
- Toggle: after `toggleRecommendationCompleted` succeeds, `isCompleted ? recordDone(updatedRec, 'user') : recordUndone(recId)` (only when the value actually changed).
- Audit: load the resolved recommendations' `text`/`category` and call `recordDone(rec, 'audit')` for each.
- [ ] Check: tick → 1 event; tick again → still 1; untick → `undoneAt` set; tick → new open event; audit on a ticked rec → same event `verified: true`, same `doneAt`; audit on an untouched rec → `source: 'audit'`, verified → tsc, eslint → commit `feat(fix-impact): record done, undone and audit-verified work`.

### Task 3: API and screens

**Files:** modify `backend/src/router/apiRouter.ts` (`/brands/:id/fix-impact` GET), `backend/src/controller/recommendationController.ts` (`getFixImpact`: org/brand checks like `toggleRecommendation`, plan from org, `{ groups }`); create `frontend/src/components/FixImpact.tsx`; modify `frontend/src/pages/Recommendations.tsx`, `frontend/src/pages/Overview.tsx`.

- `FixImpact.tsx` exports `FixImpactSection({ brandId })` and `FixImpactCard({ brandId })`, both from one `GET /brands/:id/fix-impact` call (`api` from `../utils/axios`).
- Section ("Your work and its effect", panel under the action list): a row per group — "10–14 Sep · 3 fixes", "✓ verified" when all verified, fix names, then by state: numbers "Visibility 12% → 19% ↑ +7" (`interim` adds "so far"), or the spec's message for `no-before` / `measuring` ("about N days to go") / `no-after`; flat and down use the spec's text, down links to `/competitors` (Lost-to list). Row click → per-engine before/after. Error → "Couldn't load the effect of your work right now." Empty → "Mark recommendations done as you ship them; we'll show how your AI visibility moved after each one."
- Card on Overview (above "Visibility trend"): `pickOverviewGroup`-equivalent on the client is not needed — the API marks it: add `overview: IFixGroup | null` and `measuringCount: number` to the response. Up group → "FAQ schema → visibility 12% → 19% ↑" + "See all →" (`/recommendations`); none but measuring → "Measuring the effect of N fixes, result in about D days"; else hidden; error → hidden.
- Free lock message on Recommendations: add the line "On a paid plan you can see how much your work raised your AI visibility."
- 390px: rows wrap, no page-wide horizontal scroll.
- [ ] Build frontend, tsc + eslint backend → commit `feat(fix-impact): your work and its effect on recommendations and overview`.

### Task 4: Monday email line

**Files:** modify `backend/src/service/reportService/weeklyReport.ts` (`renderWeeklyEmail` takes an optional `fixLine?: string`; `sendWeeklyReport` computes it); add cases to `fixImpact.check.ts` for the line text.

- In `sendWeeklyReport`, before rendering: `getFixImpact` → `pickEmailGroup`; line = `Result: after ${names} (${date}) your AI visibility went from ${before}% to ${after}% ↑` (names: first fix text, "+ N more" when several; date like "12 Sep"). Wrapped in try/catch: on failure no line.
- Text email: the line after the engines list. HTML: one row under the engines table, before "What to do next".
- After `sent > 0`: `fixEventModel.updateMany({ _id: { $in: group.eventIds } }, { emailedAt: new Date() })`.
- [ ] Check renders with and without the line (no `undefined` in text/html) → tsc, eslint → commit `feat(fix-impact): result line in the monday email`.

### Task 5: Verify and release

- [ ] Fresh reviewer on the branch, fixes, PR, staging, Test Sheet N10 (+ve/−ve cases), staging tester agent. Local tests: blank SMTP vars first.
