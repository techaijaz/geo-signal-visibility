# Store audit: AI-readiness of every product page — design

Feature #5 in `COMPETITIVE-FEATURES.md`, section 4. Agreed in chat on 2026-10-07: which pages, the seven checks, the score, where it shows.

## Goal

Beyond the homepage, check the store's product pages (and a few collection pages) for what AI engines need to recommend a product, and give each page an **AI-readiness score (0–100)** with a fix for every gap. A brand owner sees "Silk Oud 40/100: no reviews schema, 3 of 8 images without alt text" with the weakest pages first.

Success: on the Hasan Oud test brand, the Website audit shows a store score and a row per product page whose checks match the page HTML, and the Products page shows each saved product's score.

## Non-goals (later)

- Change since the last audit ("Silk Oud 40 → 75"), PDF report, one-click generated fixes (#13).
- A JavaScript-off check per product (Chrome per page is slow and costly); the AI Crawler View "Check this page" covers single pages.
- A separate score model for collection pages beyond the three collection checks below.

## 1. Which pages

- **Saved products** (`brand.products`, feature #2), up to the plan's `maxProducts` (free 3, starter 10, growth 25, agency 50), in their saved order.
- **No saved products:** the first `maxProducts` product URLs from the store's sitemap (`/sitemap.xml`, following a nested sitemap whose URL contains `products`, e.g. Shopify's `/sitemap_products_1.xml`), else from the homepage's product links (`productLinksIn`).
- **Collections:** up to 5 collection URLs, from Shopify's `/collections.json` (skipping `all` and `frontpage`), else homepage links matching `/collections/<handle>`.
- All URLs must be on the brand's own host; every fetch goes through `fetchPublicText` (internal addresses refused, redirects checked).

## 2. Checks and score (product pages)

A pure function `scoreProductPage(html, shopify)` built on the AI view's `extractPageFacts` plus a few new readers:

| Check | Pass when | Weight |
|---|---|---|
| Product schema | JSON-LD Product node | 25 |
| Price | price in Product/Offer schema, product meta tags, or a non-zero price in the HTML text | 20 |
| Reviews | AggregateRating in schema | 15 |
| Description | 50+ words of page text in the main content | 15 |
| FAQ | FAQPage schema, or 2+ question headings ("…?") in the main content | 10 |
| Image alt text | share of `<img>` with non-empty alt; points scale with the share, pass at 80%+ | 10 |
| Title and meta | `<title>` 10–70 characters and meta description 50–160 characters | 5 |

Score = sum of the weights earned (alt text gives partial points). Level: good 80+, warn 50–79, bad below 50. Every failed check carries a short fix tip; Shopify stores (`isShopifyHtml`) get one extra sentence about the theme or app (same style as the AI view tips).

**Collection pages** get three checks only: CollectionPage/ItemList schema, description (30+ words), title and meta. They are listed with pass/fail, without a score.

## 3. Running

- Runs at the end of the website audit (`runRealAudit`, queue job or inline), and from a new **"Audit product pages"** button (`POST /brands/:id/audit/store`, same brand and org checks as the AI view, counts against the daily audit re-scan quota).
- Pages are fetched two at a time with a 10 s timeout; a page that fails gets a row with a plain-words error (`openError`) and does not stop the rest.
- No AI calls.
- Result saved on the audit document as `storeAudit`:

```ts
interface IStoreAudit {
    checkedAt: Date
    source: 'products' | 'sitemap' | 'homepage'
    score: number | null            // average of the product pages that loaded
    pages: Array<{ url: string; name: string; kind: 'product' | 'collection'; score: number | null;
                   level: 'good' | 'warn' | 'bad' | null; checks: Array<{ key: string; label: string;
                   pass: boolean; detail: string; tip?: string }>; error?: string }>
}
```

## 4. Screens

- **Website audit → new "Product pages" panel:** the store score ("Store AI-readiness 64/100", coloured), then a table of product pages (name, score pill, ✓/✗ per check), weakest first; a row opens to the check details and fix tips. Collections in a small table below. "Audit product pages" button with the scan progress panel. Empty state when nothing could be found.
- **Products page:** a new "AI-ready" column with the saved product's score (from `storeAudit`, matched by URL); empty until the first store audit.
- 390px: tables scroll inside their box; opened details stay in view (same as the Products page).

## 5. Testing

- `backend/src/checks/storeAudit.check.ts` (no network, no DB): scoring on a Shopify-like product page and a bare JS page; each check's pass/fail and the alt-text partial points; collection checks; sitemap and `collections.json` parsing; page choice order (saved products → sitemap → homepage) with a stubbed fetcher; one failing page does not stop the others.
- Local QA agent in the browser, then the staging tester agent writing Test Sheet feature **N8**.
