# #13 Real "Generate fix": FAQ and comparison page from the brand's own pages

Date: 2026-10-12 · Roadmap item #13 in COMPETITIVE-FEATURES.md

## Why

Today's "Generate fix" is a `fixSnippet` the recommendations AI call writes alongside each
recommendation (`recommendationService.ts`). That call only knows the brand name, category and an
audit summary, so the FAQ it writes is a template ("Is Hasan Oud suitable for daily use? Yes...").
A brand owner can't publish it. This feature writes a FAQ and a "Brand vs Competitor" page from the
brand's real product pages, with sources, in English, Hinglish or Hindi.

## Scope

In: FAQ (per product kind or whole brand) and comparison page (vs one competitor), generated on
demand with a monthly limit per plan, saved for re-opening.
Out (later): llms.txt generation, review apps (Judge.me etc.), auto-generation after scans,
pushing content into the store (that comes with #6 Shopify app).

## What the user gets

**FAQ**
- 8-12 questions and answers for one product kind (e.g. Attar) or "Whole brand".
- Questions come from the brand's buyer queries for that kind and FAQs found on its pages.
- Each answer shows its source ("from the Silk Oud product page").
- Facts not found on the pages are never invented: the answer carries `[confirm: <what to check>]`
  for the owner to fill in.
- Answers are editable in place.
- Copy text, Copy HTML (for a Shopify page or blog), Copy FAQ schema (`FAQPage` JSON-LD).

**Comparison page**
- Competitor picked from the Lost-to list; default the one that won most often.
- Draft: title, short intro, difference table (price range, features, who it suits),
  "when to choose <brand>", short FAQ.
- Claims about the competitor only from its public pages or AI answers we stored, each with a
  source. Unknowns stay `[confirm]`. No negative claims about the competitor.
- Copy text, Copy HTML.

**Language:** chosen at generation: English (default), Hinglish, हिंदी.

**Where:** a "Generate fix" button on FAQ/comparison recommendations opens a panel. A new "Fixes"
page lists every saved FAQ and comparison; re-opening and copying costs nothing. The page header shows
"3/10 generations used this month".

## Choosing pages

Saved products are grouped by kind with `productKind(title, productType)` (`productKinds.ts`);
products with no kind go to "Other".

| Target | Pages read |
|---|---|
| One kind | Top 3-5 saved products of that kind (saved order) |
| Whole brand | 1-2 per kind, at most 8, plus the homepage |
| Comparison | Products of the kinds that appear in the queries the competitor won (Lost-to), up to 4, plus up to 3 pages from the competitor's site (its homepage and product links found there) |
| No saved products | Homepage plus product links found on it (same as the AI crawler view), and the panel shows "Add products in Settings → Products for a better FAQ" |

## Limits

Generations per workspace (org) per calendar month in IST:

| Plan | Per month |
|---|---|
| Free | 1 |
| Starter | 10 |
| Growth | 30 |
| Agency | 150 |

Added as `maxFixGenerations` in `config/planLimits.ts`. Only generations that finish (`status: done`)
count; failed ones don't. Usage = count of this month's `done` docs for the org, so there is no
separate counter to drift. Re-opening, editing and copying don't count.

## Flow

1. `POST /fixes` `{ brandId, type: 'faq' | 'comparison', kind?, competitor?, language }`.
   The API checks brand access and the monthly limit (counting `done` plus in-flight `pending`
   docs, so parallel clicks can't exceed it). Takes a short lock per org (`lockModel`) while
   counting and creating the `pending` doc. Over the limit → 403 "You've used all 10 generations
   this month. They reset on 1 Nov."
2. Enqueue a job on a new `fix-generation` queue (BullMQ, same setup as `citationQueue`,
   1 attempt). Returns the doc id.
3. Frontend polls `GET /fixes/:id` every 3 s and shows "Writing…".
4. Worker:
   - picks pages (above), fetches each with `fetchPublicText` (SSRF-safe, 10 s timeout);
   - extracts title, price, description, review text and on-page FAQs (`extractPageFacts` plus the
     main text), trimmed to about 1,500 words per page;
   - calls a strong model (Claude Sonnet first, then GPT-4o, through `aiService` with a model
     override) inside `withAiCallContext` so `recordAiUsage` logs the cost with purpose `fix`;
   - prompt rules: use only the given page text; return JSON; every answer cites a source URL
     from the given list; unknown facts as `[confirm: …]`; no negative claims about competitors;
     write in the chosen language;
   - validates: JSON shape, each source URL is one of the pages read (else that item becomes
     `[confirm]`), item count; one retry on broken JSON;
   - saves items and sets `status: done`.
5. `PATCH /fixes/:id` saves the owner's edits. `GET /fixes?brandId=` lists saved fixes.
   HTML and JSON-LD are built in the frontend from the saved items.

## Data

New collection `generatedFix`:

```
orgId, brandId, userId, type: 'faq' | 'comparison', kind?, competitor?, language,
status: 'pending' | 'done' | 'failed', error?, pagesRead: [{ url, ok }],
items: [{ question?, answer?, heading?, body?, rows?, source? }],
title?, createdAt, finishedAt
```

Index `{ orgId, createdAt }` for the monthly count.

## Errors

| Case | Result |
|---|---|
| No page opens | `failed`, "Couldn't open pages on your site: <reason>", not counted |
| Some pages open | Generated from those, note "Read 3 of 5 pages" |
| AI JSON broken twice | `failed`, "Couldn't write this one, try again", not counted |
| No AI provider answers | `failed`, not counted |
| Job stuck `pending` over 5 min | Treated as failed (not counted, frees the slot) |

## Testing

`backend/src/checks/generatedFix.check.ts` (like the existing checks, local Mongo, fake AI and fetch):
monthly count and IST month edge, failed not counted, pending counted against parallel requests,
page choice per kind / whole brand / comparison, foreign source URL turned into `[confirm]`,
prompt contains the no-invention rules, FAQ JSON-LD output valid. Then staging test cases in the
Test Sheet (feature N16) run by the tester agent.
