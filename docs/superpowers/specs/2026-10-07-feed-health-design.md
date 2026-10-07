# Product feed health (ChatGPT Shopping) — design

Feature #7 in `COMPETITIVE-FEATURES.md`. Agreed in chat on 2026-10-07: a separate panel on the Products page, all of the store's products, checks based on OpenAI's product feed specification.

## Goal

AI shopping assistants pick products from structured product data (title, description, brand, price, stock, images), not only from web pages. Show a brand how ready its product data is, per product and for the whole store, with the fix for every gap: "125 of 203 products have no category", "46 have only one image".

Success: on Hasan Oud (Shopify, 203 products), the panel shows a store feed score, the top gaps with counts that match the store's `products.json`, and a row per product with ✓/✗ and fixes.

## Source of the rules

OpenAI's product feed specification (developers.openai.com/commerce/specs/file-upload/products): required fields `item_id`, `title` (≤150 characters), `description` (plain text, ≤5,000 characters), `url`, `brand`, `seller_name`, `image_url` (JPEG/PNG), `availability`, `price`; recommended `gtin`, `sale_price` (< price), `product_category`, `additional_image_urls`. The "50 words" bar for descriptions is ours (same as the store audit), not OpenAI's.

## Non-goals (later)

- Downloading a feed file in OpenAI's format.
- GTIN/barcode: not in Shopify's public `products.json`; needs the Shopify app (#6). Shown as "Connect Shopify to check", never as missing.
- Non-Shopify stores (no product catalogue to read): a clear message.

## 1. Data

All products from `<store>/products.json` (`fetchShopifyProducts`, up to 1000), each product scored on its default (first) variant for price and on all variants for stock. No AI calls.

## 2. Checks and score

| Check | Weight | Pass when |
|---|---|---|
| Description | 25 | plain text from `body_html` has 50+ words and ≤5,000 characters |
| Title | 15 | 15–150 characters and not all capitals |
| Brand | 10 | `vendor` not empty |
| Main image | 10 | first image exists and is JPEG/PNG (by file extension; Shopify CDN URLs keep it) |
| Extra images | 10 | 2+ images |
| Price | 10 | default variant price > 0, and `compare_at_price` (MRP) empty or not lower than the price (equal = no discount) |
| Stock | 10 | at least one variant `available` |
| Category | 10 | `product_type` set and not a Shopify placeholder ("variable", "simple", …) |
| GTIN | 0 | not checked: "Connect Shopify to check" |

Level: good ≥80, warn 50–79, bad <50. Every failed check has a fix written for Shopify admin ("Products → <product> → Description").

**Store summary:** average score; for every check the number of products failing it, sorted by count ("125 of 203 have no category"); totals.

## 3. Running and storage

- Runs at the end of every website audit (after the store audit; never fails the audit) and from a **"Check feed"** button: `POST /brands/:id/products/feed` (brand/org checks; at most once per 10 minutes per brand, otherwise the saved result is returned). No daily quota (1–4 requests, no AI).
- Saved as `audit.feedHealth` (`{ checkedAt, shopify, total, score, summary[], products[] }`), without upsert (needs an audit document; otherwise the result is returned but not saved, and the panel says to run the website audit).
- Products visibility rows carry `feed` (that product's feed score, matched by URL), like `aiReady`.

## 4. Screens

- **Products page → "Product feed health" panel** (above the table): store feed score pill, the top gaps as sentences with counts, "Check feed" button, then a table of all products (name, score, ✓/✗ per check) with a search box and weakest first, paged 50 at a time; a row opens to details and fixes. Non-Shopify: "Feed check needs a Shopify store." 390px works like the other panels.
- **Products table:** new "Feed" column (score pill or "—").
- **Website audit:** one line under the store audit panel: "Product feed: 62/100 → see Products".

## 5. Testing

- `backend/src/checks/feedHealth.check.ts` (no network): every check on crafted Shopify products (HTML stripped to plain text, all-caps title, webp image, compare-at below price, all variants out of stock, placeholder type), score and level, summary counts and order, GTIN shown as not checked, non-Shopify, URL matching for the column.
- Local QA agent, staging tester, Test Sheet feature N9.
