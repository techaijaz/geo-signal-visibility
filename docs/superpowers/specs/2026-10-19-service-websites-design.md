# Service websites: no product talk for brands that don't sell products

*Date: 19 Oct 2026. Status: design approved in chat, waiting for spec review.*

## Why

A staging test on a dental clinic chain (Sabka Dentist, `businessType: service`) found that the app assumes every brand sells
products:

- **S1 Recommendations.** The built-in list says "Add FAQPage schema to your top 10 product pages" and "reviews on your
  primary sales channel". It has no task for the missing ProfessionalService schema.
- **S2 Products page.** It shows "Import your products…" and a feed check that "needs a Shopify store".
- **S3 Website audit.** The warning says "FAQPage schema missing on homepage and product pages". A Product pages section
  says "No product pages were found. Save your products…".
- **S4 Onboarding queries.** The queries are about HealthTech apps and online pharmacies, and the branded one asks whether
  the brand is "original".
- **S5 Fix guide.** The steps say "buyers ask", "after delivery", "what you sell, your main product pages" and "offer a
  sample".
- **S6 Audit marketplace section.** It talks about IndiaMART, Amazon and Shopify, not Google Business Profile, Justdial or
  Practo.
- **G4.** A news site (QA BBC) gets the same product-pages FAQ task, so this hits every brand that doesn't sell products.

The brand already stores `businessType` (ecommerce, saas, service, local_business, content_media; default ecommerce).
Only the audit schema label and the AI recommendation prompt read it.

**Goal:** a brand that doesn't sell products never sees text or features that assume it does, and gets tasks that fit it.
Ecommerce brands see no change.

**Success:**
- Re-running the Sabka Dentist test on staging shows none of S1–S6.
- Hasan Oud (ecommerce) looks the same as before.

## Decisions (from the chat)

- Product-only features (Products page, feed check, product page audit) are **hidden from the menu and pages** when the brand
  doesn't sell products. Settings has an **"I also sell products"** switch that brings them back (option C).
- Service and local businesses get an optional **"City or area"** field. It is used in queries and recommendations.
- **One rule in one place:** a `siteProfile(brand)` helper that every surface reads (approach 1). No AI rewriting of fixed text.
- Fix guide text becomes neutral for all brands. Three new kinds cover service sites.
- Product copy stays simple English. Hinglish only in buyer queries.

## 1. Data and `siteProfile`

**Brand fields (both optional):**

- `sellsProducts?: boolean | null`: the Settings switch. Unset means "follow businessType".
- `city?: string`: trimmed, at most 60 characters, letters, digits, spaces and `, . - '` only (anything else is
  refused with "Use letters and spaces only, like Mumbai or Andheri West"). Shown in onboarding and Settings only when
  businessType is service or local_business. Saved for any type, used only for service and local.

Both are accepted by create-brand and `PATCH /brands/:id` with Joi validation. `sellsProducts` takes true, false or null;
null clears it.

**Helper:** `backend/src/service/siteProfile.ts`

```ts
export type SiteType = 'shop' | 'service' | 'local' | 'saas' | 'media'
export interface ISiteProfile {
  type: SiteType        // ecommerce→shop, service→service, local_business→local, saas→saas, content_media→media; missing/unknown→shop
  sellsProducts: boolean // brand.sellsProducts ?? (type === 'shop')
  city: string          // only for service and local, else ''
  pagesWord: string     // 'product pages' when sellsProducts, else 'main pages'
  place: string         // city || 'India'
}
export const siteProfile = (brand: { businessType?: string | null; sellsProducts?: boolean | null; city?: string | null }) => ISiteProfile
```

- Old brands have no businessType, so they read as shop with products. Nothing changes for them.
- An ecommerce brand that turns the switch off is treated as not selling products. That is the owner's choice.
- Brand responses (GET one brand, brands list) add `sellsProducts` (the computed value) and `city`.

## 2. Surfaces, when `sellsProducts` is false

**Menu and pages (frontend)**

- AppLayout hides the **Products** menu item.
- Overview hides `ProductsCard`.
- Settings hides the `ProductsSettings` section. The "I also sell products" switch sits above where that section would be.
- Website audit hides the **Product pages** panel (StoreAuditPanel). Feed health lives on the Products page, so it is hidden
  with that page.
- Opening `/products` directly still works. The APIs are not blocked, only hidden.
- The Settings custom query placeholder no longer says "skincare product". It uses an example that fits the type, e.g.
  "Best dental clinic in Mumbai" for service and local, and "Best invoicing software for small business" for saas.

**Website audit (backend)**

- The weekly audit and Re-scan skip the product page audit (`storeAuditForBrand`) and the feed check (`runFeedHealth`).
  Saved results are kept, not deleted.
- The warning text uses `pagesWord`: "FAQPage schema missing on homepage and main pages (…)".
- AI crawler view ("What AI crawlers see"): on a non-product site only the name, description and schema rows count. Price
  and rating rows are not shown and not counted as missing.
- The marketplace block is renamed **"Listings & directories"** for non-shop types. Its help text names Google Business
  Profile, Justdial, Practo and Sulekha (service, local), G2 and Capterra (saas), or Google News and Wikipedia (media).
- Homepage link detection also counts justdial.com, practo.com, sulekha.com, g.page, maps.app.goo.gl, google.com/maps,
  g2.com and capterra.com.

**Recommendations**

- The built-in fallback list (`databseService.buildRecommendations`) reads `siteProfile`. Text changes for non-product brands:

  | Today | Non-product brand |
  |---|---|
  | Add FAQPage schema to your top 10 product pages for X | Add FAQPage schema to your main service pages for X |
  | Publish an llms.txt … what X sells | Publish an llms.txt … what X offers |
  | Collect 20+ verified customer reviews for X on your primary sales channel or Google/Trustpilot | Collect 20+ verified reviews for X on Google Business Profile (+ " in {city}" when set) |
  | — | **New, service and local only, when the audit shows Service/ProfessionalService schema missing:** Add LocalBusiness schema with your address, phone and hours for X (kind `service-schema`) |
  | — | **New, service and local only:** Get X listed on Google Business Profile, Justdial and directories like Practo in {place} (kind `local-listing`) |

  The robots.txt, comparison page and forums items stay as they are. Shop brands get exactly today's list.
- `isResolvedByAudit` drops the service-schema item when the audit finds that schema.
- The AI recommendation prompt adds, for non-product brands: "This brand does not sell products. Do not suggest product
  pages, Product schema, product feeds or marketplaces like Amazon or Flipkart." It also adds the city when set. It lists
  the three new kinds among the allowed kinds.

## 3. Fix guide and queries

**Fix guide (`fixGuide.ts`)**

- Neutral words in every kind's steps and developer notes, for all brands:

  | Today | New |
  |---|---|
  | buyers ask | customers ask |
  | after delivery | after the order or visit |
  | what you sell, your main product pages and policies | what you offer, your main pages and policies |
  | offer a sample | offer a sample or a free visit |

  Kinds that only come from the product page audit or the feed (product-schema, alt-text, price-stock, product-ids, images,
  rating-schema) keep their product words.
- Three new kinds (FixKind grows from 20 to 23). Shopify steps equal the other steps for these three.
  - `service-schema`. who: developer. Title "Add LocalBusiness schema". Steps:
    - Add LocalBusiness or ProfessionalService JSON-LD to the homepage, with name, address, phone, opening hours and services.
    - Use the same name, address and phone as on Google.
    - Test at search.google.com/test/rich-results.

    The developer note names the schema.org types (Dentist, MedicalClinic, LegalService… are subtypes of LocalBusiness)
    and the required fields.
  - `local-listing`. who: you. Title "Get listed on Google and local directories". Steps:
    - Create or claim your Google Business Profile.
    - Use the same business name, address and phone everywhere.
    - Add photos, hours and your services.
    - List on one or two directories people use for your kind of business, like Justdial, Practo or Sulekha.
    - Ask happy clients to review you there.
  - `service-pages`. who: you. Title "Give each service its own page". Steps:
    - Make one page per main service.
    - Say what it is, who it is for, and the price or price range.
    - Add 3 to 5 questions clients ask, with short answers.
    - Link each page from your menu or homepage.
- `kindFromText` rules, checked before the generic schema rule:
  - `LocalBusiness|ProfessionalService` → service-schema
  - `Google Business|Justdial|Practo|Sulekha|director(y|ies)` → local-listing
  - `service pages?` → service-pages, unless the text also says FAQ, in which case the FAQ rules win.
- `kindForCheck` is unchanged. The new kinds come only from recommendations.

**Queries (`querySuggestionService.ts`)**

- `templateQueries(category, brandName, profile?)`. When `profile.type` is not shop:
  - service and local: 5 questions built from the category noun and `place`:
    - "Best {noun} in {place}"
    - "{place} me accha aur trusted {noun} kaun sa hai"
    - "{noun} ka kharcha kitna hota hai"
    - "{noun} near me with good reviews"
    - "Affordable {noun} in {place} for families"

    `{noun}` is the category lowercased, with "& …" and "Tech" parts trimmed. "HealthTech & Healthcare" gives
    "healthcare service", and a single-word category gives "{word} service".
  - saas: "Best {noun} software for small business in India", "{noun} software ka free alternative kaunsa hai",
    "Which {noun} tool is easiest for a small team", "{noun} software pricing comparison India".
  - media: "Best {noun} websites in India", "{noun} news ke liye sabse bharosemand source kaunsa hai",
    "Where to read reliable {noun} updates".
  - Branded question for non-shop: "{brand} reviews: kaisa hai, bharosa kar sakte hain?".
- The AI suggestion prompt (`promptFor`) has a non-shop version: "questions real Indian clients ask AI when looking for a
  service like this brand offers", with the city when set. It covers cost ("kharcha kitna"), "near me", trust and reviews,
  and urgency. Occasions and rupee product budgets are dropped. The website stays in the prompt, so the AI can tell a
  dental clinic from a pharmacy.
- Onboarding and the query suggestions endpoint pass the brand's profile. The free checker is unchanged (it has no
  businessType).

## 4. Errors and edge cases

- Changing businessType from ecommerce to service hides product sections from the next page load. Product audits stop from
  the next audit. Saved product data is kept and comes back when the switch is turned on.
- A service brand with saved products and the switch off: products are hidden, not deleted.
- An empty city reads as "India" in text. Invalid characters give a 422 with the message above.
- An unknown businessType reads as shop.

## 5. Testing

- `siteProfile.check.ts` (DB-free):
  - each businessType maps to its type and sellsProducts;
  - the switch overrides in both directions;
  - city is trimmed and dropped for shop, saas and media;
  - `pagesWord` and `place`.
- `recommendations.check.ts`:
  - the service brand fallback list has no "product" word and has local-listing;
  - service-schema shows only when the audit says it is missing;
  - the shop list is unchanged, word for word;
  - the AI prompt for a service brand contains the no-products line.
- Audit check: for a service brand the product audit and feed check are not called; the warning says "main pages";
  Justdial and Practo links are detected; AI view has no price or rating rows.
- `fixGuide.check.ts`:
  - 23 kinds complete;
  - no "buyers", "delivery", "what you sell" or "sample" (without "or a free visit") outside the product-only kinds;
  - the new `kindFromText` rules;
  - no Hinglish.
- Query check: service templates use the city or "India", have no "original", and have 5 items; the non-shop AI prompt
  text; shop templates unchanged.
- Validation check: city rules, sellsProducts true/false/null.
- `npx tsc --noEmit`, prettier, all existing checks.
- **Staging (Playwright):**
  - Sabka Dentist re-test of S1–S6.
  - Hasan Oud unchanged.
  - Switch on brings back Products, Overview card and Product pages.
  - City field at 390 px.
  - Test Sheet feature with positive and negative cases.

## Out of scope

- G1 (empty suggested competitors), G2 (bot-blocked site audit message) and G3 (raw 404 page). These go in a separate small
  PR.
- Product features for service businesses that also sell products, beyond the switch.
- Free checker changes.
- Per-city scans or rank tracking by area.
- Translations.
