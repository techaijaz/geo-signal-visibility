# AI crawler view — design

Feature #4 in `COMPETITIVE-FEATURES.md`, section 4, Tier 1. Approved in chat on 2026-10-05: approach A (one extractor run on both views), triggered by a button on the Website audit page.

## Goal

Show a brand owner, side by side, what an AI crawler gets from their homepage and first product page (raw HTML, because GPTBot and ClaudeBot do not run JavaScript) and what a shopper sees (after JavaScript). Mark every fact the shopper sees but the AI does not. One screen should explain the problem.

Success means that on a JavaScript-rendered store page, the price and reviews show "✗ missing" for the AI and a warning line appears. On a server-rendered store such as Shopify / hasanoud.com, the page says the AI sees everything shoppers see.

## Non-goals

- Auditing 20 product pages (#5)
- Step-by-step fix guides; only one line plus a link to Recommendations
- Running on every audit or on a schedule

## Extraction (pure, no AI cost)

`backend/src/service/aiViewService.ts`:

- `extractPageFacts(html: string): IPageFacts`, using cheerio:
  - `name`: Product JSON-LD `name`, else `og:title`, else first `h1`, else `<title>`.
  - `price`: Product JSON-LD `offers.price` (with `priceCurrency`), else `meta[property="product:price:amount"]` / `og:price:amount`, else the first `₹ / Rs. / INR <amount>` in the visible text.
  - `rating`: `AggregateRating` `ratingValue` (+ `reviewCount`), else visible text like "4.7 out of 5" or "4.7 ★", plus "(212 reviews)".
  - `words`: word count of the visible text (body without script, style, noscript, template, svg).
  - `images`: `{ total, withAlt }` for `<img>`.
  - `schemaTypes`: reuses `schemaTypesIn` from `auditService` (exported).
  - `preview`: the first 300 characters of the visible text.
- `compareFacts(ai: IPageFacts, shopper: IPageFacts | null)` returns rows of `{ key, label, ai, shopper, missingForAi }` for name, price, rating, description and product schema. A fact is missing for the AI when the shopper has it and the AI does not. For description, it is missing when the AI view has fewer than half the shopper's words and the shopper has 50 or more.

## Fetching

- **AI view:** `axios.get(url)` with the GPTBot user-agent and a 10 s timeout.
- **Shopper view:** headless Chrome through a `withBrowser` helper moved out of `pdfService` (same limit of 2 concurrent Chromes): `page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 })`, then `page.content()`. If Chrome fails, `shopper` is null and the page shows "Couldn't load the page like a shopper" (the AI column is still shown).
- **Pages:** the brand's homepage, plus the first same-site product link found by F5's `productLinksIn` (exported). Product page first in the UI, if one exists.

## API

`POST /brands/:id/audit/ai-view` (authenticated, own brand) runs the check (about 10–30 s) and saves it on the audit document as `aiView: { checkedAt, pages: [{ url, label: 'Product page' | 'Homepage', rows, aiPreview, error? }] }`, then returns it. The existing `GET /brands/:id/audit` returns it as part of `audit`.

## Screen

Website audit page, new panel "What AI crawlers see":

- No result yet: a short explanation and a **Compare** button.
- Running: the N1 `ScanProgress` panel ("Comparing AI and shopper views").
- Result, per page: a table (Fact · AI crawler · Shoppers) with ✓ value or ✗ missing (red when `missingForAi`), the first 300 characters the AI reads, then one line:
  - Anything missing: "AI can't see the <facts> on this page: they load with JavaScript." plus a link to Recommendations.
  - Nothing missing: "AI crawlers see everything shoppers see on this page ✓".
- "Checked x ago · Compare again".

Also included: the Signup scanner label says GEMINI twice; the middle one must say GPT (QA finding).

## Testing

- **Check script** (`backend/src/checks/aiView.check.ts`, fixture HTML, no network):
  - JS-rendered fixture: the AI view lacks price and rating and has few words; the rendered fixture has them, so price, rating and description are `missingForAi`.
  - Schema price, `₹ 549` text price, "4.7 out of 5 (212 reviews)", alt counts, and name fallback order.
  - Shopify-like fixture: nothing missing.
- **Browser**, after the QA agent releases it: the Compare button, the scanner panel, results and the stale/again state, with the backend running locally (email off) against hasanoud.com.
- **Test Sheet:** feature `N4`.
