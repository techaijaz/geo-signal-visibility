# Fix impact (before/after) — design

Feature #14 in `COMPETITIVE-FEATURES.md`. Agreed in chat on 2026-10-08.

## Goal

Show a brand what happened to its AI visibility after it did the work we recommended: "10–14 Sep: 3 fixes (llms.txt, FAQ schema, robots.txt) · visibility 12% → 19% ↑ +7". Brands that never see a result think the subscription does nothing and leave; this ties their work to a number.

Wording is always "after", never "because of": visibility also moves with AI model updates, competitors and scan noise.

Success: after a brand marks recommendations done (or the audit finds them fixed), the Recommendations page lists each group of fixes with its state and, once scans exist, the before/after visibility per AI engine; Overview shows the best recent positive result; the Monday email carries one line when a result is final.

## Non-goals (later)

- Markers on the visibility chart (the saved events make this a screen-only change later).
- A section in the PDF report.
- Fixes the user writes in by hand (not from a recommendation).
- History before launch: completion dates were never saved, so results start from launch.

## 1. Data: `fixEvent` collection

New collection, separate from recommendations (which `rescanBrandRecommendations` deletes and rebuilds):

| Field | Meaning |
|---|---|
| `brandId` | brand (indexed; deleted with the brand) |
| `recommendationId` | the recommendation it came from (may no longer exist) |
| `text`, `category` | copied from the recommendation so the name survives a rescan |
| `source` | `user` (marked done) or `audit` (the audit found it fixed) |
| `verified` | true when the audit confirmed it (set for `audit` events, and on a `user` event the audit later confirms) |
| `doneAt` | when the work happened |
| `undoneAt` | set when the user unticks it; such events are ignored |
| `emailedAt` | set once the result went out in the Monday email |

**When events are written:**
1. User marks a recommendation done → new `user` event, unless an open (not undone) event already exists for that recommendation.
2. User unticks it → `undoneAt` on its open event.
3. Audit auto-resolves a recommendation (`auditService`, `isResolvedByAudit`) → if an open event exists, set `verified: true` and keep its `doneAt` (the work happened when the user did it); otherwise a new `audit` event with `verified: true`.

Writing an event never blocks the toggle or the audit: failures are logged only.

## 2. Calculation

**Groups:** open events sorted by `doneAt`; an event within 7 days of the group's **first** event joins it, otherwise it starts a new group (no chaining).

**Windows:**
- Before: the 14 days before the group's first event.
- After: from 7 to 30 days after the group's last event (the first week is skipped: AI has not picked up the change yet).

**Visibility:** per-scan, per-AI scores the same way as `getVisibilityTrendByBrandId` (mentioned / answers, per scan, from `mentions` with a `scanId`), restricted to the window. Per AI: the average over the window's scans. Only AI engines present in both windows count (a plan change that adds an engine must not move the number). Total = average of those engines. Delta = after − before, in points.

**State:**

| State | When | Shown |
|---|---|---|
| `no-before` | no scan in the before window | "No scan before this work, so there is nothing to compare with" |
| `measuring` | fewer than 2 scans in the after window | "Measuring the effect, about N days to go" (N from the next expected scan by plan interval, at least until day 7) |
| `interim` | 2+ after scans, 30 days not yet passed | numbers marked "so far" |
| `final` | 30 days passed and 2+ after scans | final numbers; eligible for the email |
| `no-after` | 30 days passed with fewer than 2 after scans (scans stopped, plan changed) | "Not enough scans after this work to measure it" |

**Result:** delta > +3 → up (green ↑); −3 to +3 → flat (grey, "No big change yet. AI takes time to pick up new content."); < −3 → down (neutral colour, "Visibility 19% → 14%. This is unlikely to come from the fix; see which brands moved ahead" with a link to the Lost-to list). The ±3 band absorbs normal scan-to-scan noise.

No AI calls; computed on read from `mentions` (two small aggregations per request, bounded to the brand's last ~60 days of events).

## 3. API

`GET /brands/:id/fix-impact` (same org/brand checks as other brand routes) → groups, newest first:

```ts
{ groups: Array<{
    start: Date; end: Date;
    fixes: Array<{ text: string; category: string; verified: boolean; doneAt: Date }>;
    verified: boolean;            // every fix in the group verified
    state: 'no-before' | 'measuring' | 'interim' | 'final' | 'no-after';
    daysLeft?: number;            // measuring
    before?: number; after?: number; delta?: number;
    result?: 'up' | 'flat' | 'down';
    engines?: Array<{ name: string; before: number; after: number }>;
  }> }
```

## 4. Screens

- **Recommendations page → "Your work and its effect"** section below the action list: one row per group ("10–14 Sep · 3 fixes ✓ verified", the fix names, "Visibility 12% → 19% ↑ +7" or the state message); a row opens to per-engine before/after. Built from events, so it survives a recommendation rescan. 390px works like the other panels.
- **Free plan:** recommendations are locked, so no events exist. The locked message gets one line: "On a paid plan you can see how much your work raised your AI visibility."
- **Overview card "Your work and its effect":** the best `up` group (interim or final) from the last 60 days, "FAQ schema → visibility 12% → 19% ↑" plus "See all →"; if none but a group is measuring, "Measuring the effect of 3 fixes, result in about 9 days"; otherwise the card is hidden. Never shows flat or down results.

## 5. Monday email

`weeklyReport.ts` picks the brand's best group that is `final`, `up` and not yet emailed, adds one line ("Result: after FAQ schema (12 Sep) your AI visibility went from 12% to 19% ↑") with a link to the app, then sets `emailedAt` on that group's events. No line when there is no such group; flat or down results are never emailed.

## 6. Errors

- Event write fails → logged; toggle and audit carry on.
- Impact calculation fails → Overview card hidden; Recommendations section shows a short message, the rest of the page works.
- Repeated tick/untick → at most one open event per recommendation.
- The audit seeing the same fix again → no new event.

## 7. Testing

- `backend/src/checks/fixImpact.check.ts` (no network, pure functions on crafted events and scan points): grouping (7 days from the first event, no chaining), windows (14 days before; 7–30 days after), engines only in both windows, every state, ±3 bands, undone events ignored, email pick (final + up + not emailed).
- Event recording: tick, untick, re-tick, audit confirming a user event, audit-only event.
- PR, staging, Test Sheet feature N10, staging tester agent.
