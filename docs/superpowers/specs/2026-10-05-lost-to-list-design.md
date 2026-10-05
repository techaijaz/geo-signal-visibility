# Lost-to list ("AI kise recommend kar raha hai") — design

Feature #1 in `COMPETITIVE-FEATURES.md`, section 4, Tier 1. Approved in chat on 2026-10-05: extraction approach A, Overview card plus a Competitors section, and a useful zero state.

## Goal

When a brand owner opens Signal, they immediately see which brands the AI engines recommend **instead of them**, how often and how high: "Ajmal 7/14 answers, avg #2". One click adds any of those brands to their tracked competitors. When the brand is named nowhere, the page shows a path forward, not a dead end.

Success means that on the Hasan Oud test brand, Overview shows Ajmal, Fogg, Engage and Denver with real counts from the last scan, and "Track" adds one to Competitors.

## Non-goals (later features)

- Trend over time, alerts ("Ajmal overtook you"): #11, #14
- The list inside the PDF report
- Tracking brand questions automatically ("What does AI say about you" card): separate follow-up
- Why a competitor wins (citations / sources): #9

## 1. Extracting brand names

**New:** `backend/src/service/brandExtractionService.ts`

- `extractBrands(answers: { id, text }[], ownBrand: string): Promise<Map<id, { name, position }[]>>`
- Sends answers in chunks of 10 to `aiService.callAnyAvailableAi` (cheapest available model first). The prompt asks for the brand or company names each answer recommends, using short brand names and not product names, as JSON `{ "<answerIndex>": ["Ajmal", "Fogg"] }`.
- **Validation (the AI is not trusted):**
  - Keep a name only if it occurs in that answer's text (whole-word, case-insensitive; same `nameMatcher` as `competitorService`).
  - Drop the user's own brand.
  - Trim it, collapse spaces, and de-duplicate case-insensitively within the answer.
- **Position:** computed from the text with the existing `positionIn` rule (list number, else line, max 5), so it matches how the user's own position is computed. The AI's ordering is ignored.
- Exposes the pure helpers (`validateNames`, `positionIn`) for the check script.

**Where it runs:** in `aiService.scanMentionsWithAi`, right after the scan's mentions are inserted, inside the existing `withAiCallContext`. Each mention is updated with `brandsNamed`. A failure is logged and leaves `brandsNamed` unset; the scan still succeeds.

**Cost logging:** `costLogService` purpose gains `'brands'`, so these calls show separately on the Cost Logs page. Expected cost is about one cheap call per 10 answers.

**Older scans:** when the API finds the latest scan's mentions have `rawText` but no `brandsNamed`, it runs the extraction once and saves the result (lazy backfill).

**Model change:** `mentionModel` gains `brandsNamed: [{ name: String, position: Number }]` (no `_id`), default unset. An empty array means "extracted, none found"; unset means "not extracted".

## 2. API

`GET /brands/:id/lost-to` (authenticated, brand must belong to the user's org; same checks as `/competitors/compare`). It works from the latest scan only (`brand.lastScanId`) and returns:

```ts
{
  totalAnswers: number,            // answers in the latest scan
  extracted: boolean,              // false = names not available yet
  you: { named: number, bestPosition: number | null,
         closestWin: { queryText, model, position } | null },  // best single appearance
  brands: Array<{                  // top 20, most answers first, then better avg position
    name, answers, avgPosition, aheadOfYou,   // aheadOfYou = answers where you were absent or ranked lower
    tracked: boolean               // already in brand.competitors (case-insensitive)
  }>,
  byQuestion: Array<{ queryText, rows: Array<{ model, you: number | null,
                                               others: Array<{ name, position }> }> }>,
  topActions: Array<{ _id, text }> // up to 3 open High-impact recommendations, for the zero state
}
```

Aggregation is a pure function, `computeLostTo(mentions, brand, recommendations)`, in `competitorService.ts` next to `computeCompetitorStats`, so the check script can call it.

**Track:** there is no new endpoint. The page sends the existing `PATCH /brands/:id` with `competitors` plus `{ name }`. The button is disabled with "Plan limit reached" when the brand already tracks `limits.maxCompetitors`.

## 3. Screens

**Overview card "AI is recommending instead of you"** (new component `LostToCard.tsx`, placed under the score cards):

- Up to 5 rows: name · "7/14 answers" · "avg #2" · **Track** button or a "tracked" tag.
- Footer link: "See every question →" to `/competitors#lost-to`.
- **You named nowhere** (`you.named === 0`, brands found): "None of the 14 answers named Hasan Oud. That is common for newer brands: AI recommends brands it has read about in many places. Start with:" followed by `topActions` (links to Recommendations).
- **Closest win** (`you.named > 0`): one line above the list: "Perplexity named you #4 for 'alcohol free attar'."
- **Not extracted yet / failed:** "Brand names will appear after the next scan."
- **No scan yet:** card hidden (the existing Overview empty state already covers it).

**Competitors page section "Brands AI names instead of you"** (`id="lost-to"`):

- The full list (up to 20) with the same columns plus "ahead of you".
- "By question": each question, then one line per AI: "You #3 · Ajmal #1, Fogg #2" or "You — · Ajmal #1".

**Settings → queries:** one line under the query list: "Changing questions changes what we measure, not what AI knows about you. Fixes on your site and mentions elsewhere move it, usually within 2–6 weeks."

## Error handling

- Extraction failure never fails a scan; the card shows the "after the next scan" state.
- The AI returns a name that is not in the text: dropped.
- The AI returns broken JSON for a chunk: that chunk's answers get `brandsNamed: []` and a warning is logged. The other chunks are kept.
- No AI key available: same as broken JSON. The cost is zero.

## Testing

- **Check script (no real AI):** `validateNames` drops invented, own-brand and duplicate names. `positionIn` matches the scan rule. `computeLostTo` gives the right counts, avg position, `aheadOfYou`, `tracked`, `closestWin` and zero state on a fixed set of sample answers.
- **Mocked scan:** `scanMentionsWithAi` with fake provider responses writes `brandsNamed` and a `brands` cost log, and an extraction failure still saves the scan.
- **Browser (backend with email off, AI mocked):** Overview card rows, the Track button adds a competitor and turns into "tracked", the zero state shows top actions, and the Competitors "By question" section renders.
- **Test Sheet:** feature "N3 · Lost-to list" with positive and negative cases after the staging deploy.
