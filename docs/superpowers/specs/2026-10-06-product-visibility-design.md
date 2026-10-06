# Product-level visibility (SKU tracking) — design

Feature #2 in `COMPETITIVE-FEATURES.md`, section 4, Tier 1. Agreed in chat on 2026-10-06, section by section: products come from Shopify automatically (manual add for other stores), the app writes a short name per product that the user can edit, and products are measured on the brand's existing questions, with product questions suggested for the user to add.

## Goal

A D2C brand owner sees which of their **products** AI engines recommend, not only whether the brand is named: "Silk Oud: 3/14 answers, best #2 on ChatGPT. Black Oud: not seen." They also see which products are never named, with a next step for each.

Success means: on the Hasan Oud test brand (Shopify, 203 products), the owner imports products in about two minutes, picks their top products, and after a scan the Products page shows real counts that match the answer text.

## Non-goals (later features)

- Products in the PDF report, alerts
- A per-product AI-readiness score (#5), ChatGPT Shopping feed checks (#7)
- Scanning separate questions per product automatically (would multiply scan cost)
- Changes to onboarding

## 1. Data

`brandModel` gains `products` (default `[]`, no migration):

```ts
interface IBrandProduct {
    shopifyId: string | null   // null for manual products
    title: string              // full store title
    shortName: string          // what is searched for in answers
    aliases: string[]          // other spellings, optional, max 3
    url: string
    price: number | null       // rupees
    image: string
    productType: string
    nameEditedByUser: boolean  // a refresh never overwrites a name the user changed
}
```

`planLimits.ts` gains `maxProducts`: free 3, starter 10, growth 25, agency 50. After a downgrade nothing is deleted; only the first `maxProducts` are counted and the rest show "upgrade to track".

## 2. Import from Shopify

**New:** `backend/src/service/productService.ts`.

- `fetchShopifyProducts(website)`: reads `<site>/products.json?limit=250&page=N`, up to 4 pages (1000 products), through `fetchPublicText` from `util/publicUrl.ts`, so internal addresses are refused and every redirect is checked. Not JSON, 404, or no `products` array means "not a Shopify store".
- `cleanProductList(raw, brandName)`: maps to `IBrandProduct` candidates and marks junk as hidden: price 0, titles with "sample", "tester", "gift card", "gift packaging", sizes of 1 to 5 ml. When a sample and a full-size product get the same short name, only the full-size one is kept. Hidden items stay in the response so the user can show them.
- `ruleShortName(title, brandName)`: removes the brand name in any spelling (brandKey match: "By Hasan Oud", "by Hasanoud", "HASANOUD"), "by"/"from", sizes ("1ml", "100 ml"), and filler phrases ("Premium Fragrances", "Alcohol Free", "Long Lasting", "Attar", "Perfume", "Sample", "Special", "Powerful", "Strong", plus a short list for other verticals). It keeps the first 2 to 3 remaining words, title-cased.

**Short names with AI:** after the user ticks products, one cheap call through `callAnyAvailableAi` cleans the names of only those products (cost purpose `products`, about ₹0.05). An AI name is accepted only when it has 1 to 4 words, every word occurs in the title, and it does not contain the brand name; otherwise the rule name stays. Limited to 10 calls per brand per 24 hours, counted from cost logs. A failed call keeps the rule names and never blocks saving.

**Refresh:** "Refresh from Shopify" updates `price`, `url`, `image` and `title` of saved products by `shopifyId`, and never touches a name with `nameEditedByUser`.

**Manual add:** for non-Shopify stores, or anything else: short name (required), optional link and price.

## 3. Matching and counting

Counting happens when the page is read, from the saved answer text (`mention.rawText`) of the latest scan and the one before it (`loadScanPair`). This is the same pattern as competitor stats and the lost-to list: products added today show results on the last scan, renaming updates at once, and no AI call is needed.

`computeProductVisibility(mentions, previous, brandName, products, maxProducts)` in `productService.ts` (pure, no DB):

- **Match:** the short name or an alias as a whole phrase (`nameMatcher`), case-insensitive.
- **Too generic:** a one-word short name is matched only if it is not a common word for the vertical ("Oud", "Rose", "Amber", "Musk", "Classic", "Gold"...). Such a product shows a hint to make the name more specific.
- **Whose product:** an answer counts only if it also names the brand, or the product name appears next to the brand name ("Hasan Oud Silk Oud"). This stops another brand's "Silk Oud" from counting.
- **Position:** `positionIn` (the list-number rule fixed in PR #25).
- **Output per product:** answers named, total answers, best position, models that named it, previous scan's count, and per question the model, position and the one line of the answer that names it.
- **Order:** most answers first, then best position; "Not seen" last.
- Only the first `maxProducts` products are counted.

## 4. API

All authenticated, brand must belong to the user's org (same checks as `/lost-to`):

- `GET /brands/:id/products` → saved products and `maxProducts`.
- `PUT /brands/:id/products` → saves the list; Joi validation; 403 with "Your <plan> plan allows maximum N products…" over the limit.
- `POST /brands/:id/products/import` → `{ shopify: boolean, products: candidates[], hidden: number }`. Saves nothing.
- `POST /brands/:id/products/short-names` `{ titles: string[] }` → AI-cleaned names; 429 over the daily cap.
- `GET /brands/:id/products/visibility` → the result of `computeProductVisibility`, plus `suggestedQuestions` for products not seen.

**Suggested product questions:** built without AI from the product's type and price, rounded up to a buyer's budget, for example "600 ke andar sabse accha oud attar" or "Best oud attar under ₹600". Duplicates of the brand's queries are dropped. "Add" puts one into the brand's queries within the plan's query limit.

## 5. Screens

- **Settings → Products** (new section): list of saved products (image, short name, title, price, aliases) with edit and remove; "Import from Shopify" opens the picker; "Add manually" form; "Refresh from Shopify".
- **Picker:** search box, ticks up to the plan limit, a "Show N hidden items" link, then "Next" (AI names) and a review step where every name can be edited before Save.
- **Products page** (sidebar, after Competitors): the table from section 3; each row opens to show the questions, models, positions and the answer line. A "Not seen" row shows the suggested question with "Add" and "Check this page", which opens the AI Crawler View for that product URL.
- **Overview card** "Your products in AI answers": top 3 named products and a line like "7 of 10 products were not named in any AI answer", with "See all →".
- **Empty states:** no products → "Import your products from Shopify"; products but no scan → "Results after your next scan"; products but none named → a clear message and the suggested questions, never a bare 0%.

## 6. Errors

- Site down, not Shopify, or `products.json` blocked → "Shopify store not found. Add products manually." plus the manual form.
- Internal address → refused (same as the AI view).
- AI naming fails → rule names stay; save works.
- Over the product limit → 403 on save; the picker disables ticks at the limit.
- Visibility API fails → an error line in the card and page; the rest of the page loads.
- Scans without `rawText` → "This scan has no answer text. Run a new scan."

## 7. Cost

Import and counting use no AI. Naming uses one cheap call per import step (capped at 10 a day per brand). Scan cost does not change.

## 8. Testing

- `backend/src/checks/products.check.ts` (no DB, no real AI): rule names on real Hasan Oud titles; junk filter (sample, ₹0, gift packaging, sample vs full-size); AI name validation (word not in title, brand name, too long); matching (whole phrase, generic one-word name, brand present, markdown list position); `computeProductVisibility` (counts, previous scan, plan cap, empty cases); Shopify import against a `products.json` fixture with a stubbed fetch.
- QA agent, local browser run (email off): import, pick, rename, save, Products page after a scan, Overview card, limits, a non-Shopify site, phone width.
- After merge: Test Sheet feature N6 with positive and negative cases; staging check on Hasan Oud before prod.

## 9. Release

No migration (`products` defaults to `[]`). Staging first with the Hasan Oud test brand, then prod.
