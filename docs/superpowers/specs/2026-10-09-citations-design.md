# Where AI reads: citations and outreach list — design

Feature #9 in `COMPETITIVE-FEATURES.md`. Agreed in chat on 2026-10-09, after a spike on production keys.

## Goal

Show a brand which web pages an AI search engine reads when it answers the brand's buyer questions, and turn that into an **outreach list**: "pages that name your competitors but not you — get on them". Also show whether the brand's own site is ever a source ("Your site was cited in 0 of 10 answers; Ajmal's site: 3").

Success: on Hasan Oud, the list contains Indian pages like `lbb.in/all/best-attars`, `sultanattar.com/blogs/best-oudh-attar-under-1000-inr` and `jainperfumers.com` blogs, each with the competitors found on the page.

The view is one engine's (Gemini with Google Search); the screen says so. Cost matters (no funding): every call is capped and logged.

## Spike results (2026-10-09, throwaway scripts)

- Our normal scans call plain chat APIs: no web search, no sources. Sources need a search-grounded call.
- **Gemini `gemini-3.8-flash` + `google_search` tool**: searched on every question (1–2 queries each), returned 2–9 sources per answer, almost all Indian (blogs, Flipkart, YouTube); 70–115 s per call at the time (Google under load, one 503). Cost ≈ ₹0.60 per call (₹7.17 for ~12 calls incl. aborted ones), mostly tokens; grounding on Gemini 3.x is 5,000 search requests/month free on the paid tier, then $14 per 1,000. `gemini-2.5-flash` is closed to new users.
- OpenAI `gpt-4o-mini` + `web_search`: searched on only 2 of 5 questions, ~8,000 input tokens per searched call, some non-Indian results (daraz.pk, eBay). Not used now.
- Perplexity: no key on production. Serper: not needed while Gemini reads Google.

## Non-goals (later)

ChatGPT/OpenAI or Perplexity sources; Serper; reading deeper than the page text; drafting outreach emails; a PDF section; history charts; a manual "run now" button.

## 1. The weekly citation scan

- **When:** cron every Sunday 22:00 IST queues one job per brand on a paid plan in a new `citation-scan` queue (concurrency 1). A new brand gets one run right after onboarding (first scan done), so the page is not empty for a week. At most one run per brand per ISO week (a repeated job does nothing).
- **Switch:** admin setting `citationsEnabled` (default on); off → the cron queues nothing.
- **Questions per run, by plan:** free 0 (feature locked), starter 5, growth 10, agency 20. Picked from `brand.queries`: first the questions where the latest normal scan named a tracked competitor and not the brand, then the rest in saved order, up to the limit.
- **Gemini call per question:** `gemini-3.8-flash`, `tools: [{ google_search: {} }]`, minimal thinking, `maxOutputTokens` ≈ 400, 120 s timeout; usage recorded through `recordAiUsage` (`costLog`, feature `citations`). A failed call (429, 503, timeout) skips that question; the run carries on.
- **Sources:** `groundingMetadata.groundingChunks[].web` → resolve each redirect link (HEAD, no follow, 5 s timeout) to the real URL; strip `utm_*` and fragments; one entry per URL across all questions, with the questions it was cited for.
- **Brands on each page:** fetch the page with `fetchPublicText` (SSRF-safe, existing); look for the brand and each tracked competitor (names, aliases, no-space forms, same matching as the Lost-to list: `nameMatcher`/`brandKey`). If the page can't be read, use the brands named in the answer text the page supports (`groundingSupports`), marked "from AI answer".
- **Type by domain rules (no AI):** marketplace (amazon, flipkart, nykaa, myntra, meesho, 1mg, jiomart, ajio, tatacliq, purplle, snapdeal), video (youtube), own site (the brand's website domain), competitor site (a tracked competitor's website domain, if known), else article.
- **Saved:** a `citationRun` document per brand per week; the last 8 runs kept.

## 2. Data: `citationRun`

| Field | Meaning |
|---|---|
| `brandId`, `week` (ISO week, unique per brand) | which run |
| `status` | `running`, `ok`, `failed` |
| `startedAt`, `finishedAt` | timing |
| `questions[]` | `{ text, ok, error? }` |
| `pages[]` | `{ url, domain, title, type, citedIn: string[], brands: string[], brandFound: boolean, readFrom: 'page' \| 'answer' }` |

Cost is not stored here; it lives in `costLog`. Deleted with the brand. Older than the last 8 per brand are removed when a new run is saved.

## 3. Calculation (on read)

- **Outreach list:** pages with at least one tracked competitor and not the brand, excluding own site and competitor sites. Order: number of questions cited in (desc), number of competitors (desc), type (article and video before marketplace). Each row: title + link, domain, type, competitors, cited-in count and questions, **New** when the URL was not in the previous `ok` run's list, and a tip (marketplace: "List your product here and collect reviews"; article/video: "Reach out to be included").
- **Top sources:** the 10 domains cited most, with counts.
- **Own site line:** times the brand's site was cited vs the most-cited competitor site; when 0, link to the Website audit and Store audit ("AI reads competitors' product pages — improve yours").
- **Counts:** questions checked/failed, pages found/read, new targets vs last run.

## 4. API and screens

- `GET /brands/:id/citations` (org/brand checks like other brand routes) → `{ locked }` on free; else `{ run: { week, status, checkedAt, questions, failed } | null, outreach[], topSources[], ownSite, counts, newCount, previousOk?: date }`. When the latest run failed, the last `ok` run is used and `failedLatest: true`.
- **Competitors page → "Where AI reads"** (below the Lost-to list): header line "Gemini with Google Search · checked 12 Oct · 10 questions · 47 pages" and the note "AI also reads other sources; this is one engine's view." Outreach table (Page, Type, Competitors, Cited in; New badge; row opens to the questions and the tip; 20 rows then "Show more"); top sources list with the own-site line. States: none yet ("First check runs after your first scan, then every Sunday"), running ("Checking where AI reads…"), failed latest ("This week's check failed; showing <date>"), free ("Upgrade to see which pages AI reads" + upgrade button). 390px: the table scrolls inside its box.
- **Overview card "Top outreach targets":** 3 rows (page + competitors) and "See all →" to Competitors; hidden on free or with no data.

## 5. Monday email

When the latest run is `ok` and the outreach list is not empty: one line "Top source to reach this week: <domain> — <title> (names <competitors>; not you)" with the link; new pages first. No line otherwise. Independent of the fix-impact line.

## 6. Errors and cost control

- Gemini errors → question skipped; all failed → run `failed`, the page shows the last `ok` run.
- Page unreadable → brands from the answer, "from AI answer".
- No Gemini key or switch off → nothing queued, no cost.
- Same week again → no new run. Plan downgraded to free → no new runs, page locked.
- Costs: every call in `costLog`; per brand per month ≈ starter ₹13, growth ₹26, agency ₹52 at ≈ ₹0.60 per call.

## 7. Testing

- `backend/src/checks/citations.check.ts` (no network): question picking (lost first, plan cap), URL cleaning (utm, duplicates), types, brand matching on page text (aliases, no-space forms), outreach filter and order, New badge, own-site line, email line; Gemini response from a fixture.
- PR, staging, Test Sheet N11, staging tester agent; one real staging run (5–10 calls, ≈ ₹3–6) after the user's go-ahead; staging has no AI keys, so the user adds the Gemini key to staging first (or the run is tested on production with the user's go-ahead).
