# Service Websites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brands that don't sell products (service, local, SaaS, media) see no product talk or product features, and get tasks, guides and queries that fit them. Ecommerce brands see no change.

**Architecture:**
- One pure helper, `siteProfile(brand)`, decides the site type, whether the brand sells products, and its city. Every backend surface reads it.
- The brand's JSON adds the computed `sellsProducts`, so the frontend can hide menu items and sections.
- Fixed text stays in code (no AI rewriting). The non-product versions sit next to today's text.

**Tech Stack:** Node/Express/TypeScript/Mongoose/Joi backend; React/Vite/TS frontend; checks are ts-node scripts in `backend/src/checks/*.check.ts`.

**Spec:** `docs/superpowers/specs/2026-10-19-service-websites-design.md`

## Global Constraints

- Product and website copy in simple English. Hinglish only in buyer queries (query templates and AI query prompts).
- Old brands with no `businessType`, `sellsProducts` or `city` behave exactly as today (shop, sells products).
- `city`: trimmed, at most 60 characters, matching `^[\p{L}\p{N} ,.'-]{0,60}$`; else 422 with "Use letters and spaces only, like Mumbai or Andheri West".
- `sellsProducts` on the brand: true, false or null (null = follow businessType).
- No data is deleted when product features are hidden.
- Commits: conventional, subject starts lower-case, author is the user, no Claude trailer or attribution.
- Before each commit, inside `backend/`:
  - Run `npx prettier --write src` (CI checks formatting).
  - Run `npx tsc --noEmit -p .` (checks use `--transpile-only` and miss type errors).
- DB-free checks run with `NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none`. DB checks run against local Mongo with `SMTP_HOST= SMTP_USER= SMTP_PASS=` blank.

## Review Focus

1. An ecommerce brand saved in Settings without touching the switch must keep `sellsProducts: null`. A later change to service must then hide product features. (Task 6 sends null when the switch equals the type default. Task 1 tests that null clears.)
2. An old brand document with none of the new fields must serialise with `sellsProducts: true` and read as shop. (Task 1 tests `toJSON` on such a document.)
3. The shop recommendation list must stay word for word as today. (Task 3 deep-compares it with a frozen copy.)
4. City input with HTML or over 60 characters must be refused. A city saved on a shop, saas or media brand must never reach text. (Task 1.)
5. The AI crawler view for a product site must still show all five rows, and the shop query templates must be unchanged. (Tasks 4 and 5.)

---

### Task 1: `siteProfile`, brand fields, validation, brand JSON

**Files:**
- Create: `backend/src/service/siteProfile.ts`
- Modify: `backend/src/model/brandModel.ts` (fields near `businessType` ~line 84; schema options ~line 173)
- Modify: `backend/src/types/brandTypes.ts` (`ICreateBrandRequestBody`, `IUpdateBrandRequestBody`, `IBrand`)
- Modify: `backend/src/service/validationService.ts` (`validationCreateBrandBody`, `validationUpdateBrandBody`)
- Modify: `backend/src/controller/brandController.ts` (`brandPayload` in `createBrand` ~line 142)
- Test: `backend/src/checks/siteProfile.check.ts`

**Interfaces:**
- Produces:
  - `siteProfile(brand: { businessType?: string | null; sellsProducts?: boolean | null; city?: string | null } | null | undefined): ISiteProfile`
  - `ISiteProfile = { type: SiteType; sellsProducts: boolean; city: string; pagesWord: string; place: string }`
  - `SiteType = 'shop' | 'service' | 'local' | 'saas' | 'media'`
  - `CITY_RE`
  - `citySchema()` (Joi) in validationService
  - Brand JSON field `sellsProducts: boolean` (computed) and `city: string`

- [ ] **Step 1: Write the failing test** `backend/src/checks/siteProfile.check.ts`

```ts
/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/siteProfile.check.ts
import assert from 'assert'
import { siteProfile } from '../service/siteProfile'
import { validationCreateBrandBody, validationUpdateBrandBody } from '../service/validationService'
import brandModel from '../model/brandModel'

// Each businessType maps to a type; only shops sell products by default
assert.deepEqual(siteProfile({ businessType: 'ecommerce' }), { type: 'shop', sellsProducts: true, city: '', pagesWord: 'product pages', place: 'India' })
assert.equal(siteProfile({ businessType: 'service' }).type, 'service')
assert.equal(siteProfile({ businessType: 'local_business' }).type, 'local')
assert.equal(siteProfile({ businessType: 'saas' }).type, 'saas')
assert.equal(siteProfile({ businessType: 'content_media' }).type, 'media')
for (const t of ['service', 'local_business', 'saas', 'content_media']) assert.equal(siteProfile({ businessType: t }).sellsProducts, false, t)
assert.equal(siteProfile({ businessType: 'service' }).pagesWord, 'main pages')
// Old brands and unknown values read as a shop
assert.equal(siteProfile({}).type, 'shop')
assert.equal(siteProfile(null).sellsProducts, true)
assert.equal(siteProfile({ businessType: 'constructor' }).type, 'shop')
// The switch overrides both ways; null follows the type
assert.equal(siteProfile({ businessType: 'service', sellsProducts: true }).sellsProducts, true)
assert.equal(siteProfile({ businessType: 'service', sellsProducts: true }).pagesWord, 'product pages')
assert.equal(siteProfile({ businessType: 'ecommerce', sellsProducts: false }).sellsProducts, false)
assert.equal(siteProfile({ businessType: 'ecommerce', sellsProducts: null }).sellsProducts, true)
// City: trimmed, only for service and local
assert.equal(siteProfile({ businessType: 'local_business', city: '  Mumbai ' }).city, 'Mumbai')
assert.equal(siteProfile({ businessType: 'local_business', city: '  Mumbai ' }).place, 'Mumbai')
assert.equal(siteProfile({ businessType: 'ecommerce', city: 'Mumbai' }).city, '')
assert.equal(siteProfile({ businessType: 'saas', city: 'Pune' }).place, 'India')

// Validation: city rules, sellsProducts true/false/null
const upd = (body: object) => validationUpdateBrandBody.validate(body)
assert.equal(upd({ city: 'Andheri West, Mumbai' }).error, undefined)
assert.equal(upd({ city: '' }).error, undefined)
assert.equal(upd({ city: '<script>' }).error?.message, 'Use letters and spaces only, like Mumbai or Andheri West')
assert.ok(upd({ city: 'a'.repeat(61) }).error)
for (const v of [true, false, null]) assert.equal(upd({ sellsProducts: v }).error, undefined, String(v))
assert.ok(upd({ sellsProducts: 'yes' }).error)
const created = validationCreateBrandBody.validate({ name: 'Sabka Dentist', website: 'https://sabkadentist.com', category: 'HealthTech & Healthcare', city: ' Mumbai ' })
assert.equal(created.error, undefined)
assert.equal(created.value.city, 'Mumbai')

// Brand JSON carries the computed sellsProducts (an old document with no new fields reads as selling products)
const json = (doc: object) => new brandModel(doc).toJSON() as unknown as { sellsProducts: boolean; city: string }
const base = { orgId: '64b000000000000000000001', name: 'X', website: 'https://x.com', category: 'Y' }
assert.equal(json(base).sellsProducts, true)
assert.equal(json({ ...base, businessType: 'service' }).sellsProducts, false)
assert.equal(json({ ...base, businessType: 'service', sellsProducts: true }).sellsProducts, true)
assert.equal(json({ ...base, businessType: 'service', city: 'Pune' }).city, 'Pune')

console.log('siteProfile checks: PASS')
process.exit(0)
```

- [ ] **Step 2: Run it to verify it fails**

Run (in `backend/`): `NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/siteProfile.check.ts`
Expected: FAIL with "Cannot find module '../service/siteProfile'".

- [ ] **Step 3: Write `backend/src/service/siteProfile.ts`**

```ts
// One rule for "does this brand sell products?": every page, task and query list reads it
export type SiteType = 'shop' | 'service' | 'local' | 'saas' | 'media'
export interface ISiteProfile {
    type: SiteType
    sellsProducts: boolean
    city: string
    pagesWord: string
    place: string
}

const TYPES: Record<string, SiteType> = {
    ecommerce: 'shop',
    service: 'service',
    local_business: 'local',
    saas: 'saas',
    content_media: 'media'
}
export const CITY_RE = /^[\p{L}\p{N} ,.'-]{0,60}$/u

export const siteProfile = (brand: { businessType?: string | null; sellsProducts?: boolean | null; city?: string | null } | null | undefined): ISiteProfile => {
    const bt = brand?.businessType || ''
    // Old brands have no type: they are shops, as before
    const type: SiteType = Object.prototype.hasOwnProperty.call(TYPES, bt) ? TYPES[bt] : 'shop'
    const sellsProducts = typeof brand?.sellsProducts === 'boolean' ? brand.sellsProducts : type === 'shop'
    const city = type === 'service' || type === 'local' ? (brand?.city || '').trim().slice(0, 60) : ''
    return { type, sellsProducts, city, pagesWord: sellsProducts ? 'product pages' : 'main pages', place: city || 'India' }
}
```

- [ ] **Step 4: Brand model.** In `brandModel.ts`, add after the `businessType` field:

```ts
        // The "I sell products" switch; null follows businessType (see siteProfile)
        sellsProducts: {
            type: Boolean,
            default: null
        },
        city: {
            type: String,
            trim: true,
            maxlength: 60,
            default: ''
        },
```

Change the schema options `{ timestamps: true }` to:

```ts
    {
        timestamps: true,
        // The API sends the computed answer, so the app never repeats the rule
        toJSON: {
            transform: (_doc, ret) => {
                ret.sellsProducts = siteProfile(ret).sellsProducts
                return ret
            }
        }
    }
```

Add `import { siteProfile } from '../service/siteProfile'` at the top.

- [ ] **Step 5: Types.** In `brandTypes.ts`, add these two fields to `ICreateBrandRequestBody`, `IUpdateBrandRequestBody` and `IBrand`:

```ts
    sellsProducts?: boolean | null
    city?: string
```

- [ ] **Step 6: Validation.** In `validationService.ts`, add `import { CITY_RE } from './siteProfile'`. Add above `validationCreateBrandBody`:

```ts
// City or area for service and local businesses; plain words only
export function citySchema() {
    const msg = 'Use letters and spaces only, like Mumbai or Andheri West'
    return Joi.string().trim().max(60).allow('').pattern(CITY_RE).messages({
        'string.pattern.base': msg,
        'string.max': 'Keep the city or area under 60 characters'
    })
}
```

Add these lines to both `validationCreateBrandBody` and `validationUpdateBrandBody`, after `businessType`:

```ts
    sellsProducts: Joi.boolean().allow(null).optional(),
    city: citySchema().optional(),
```

- [ ] **Step 7: Create brand.** In `brandController.createBrand`, add to `brandPayload` after `businessType`:

```ts
                sellsProducts: value.sellsProducts ?? null,
                city: value.city || '',
```

(`updateBrand` already `$set`s the validated body, so PATCH needs no change.)

- [ ] **Step 8: Run the test.** Same command as Step 2.
Expected: `siteProfile checks: PASS`.

- [ ] **Step 9: Format, typecheck, commit.** In `backend/`, run `npx prettier --write src` and `npx tsc --noEmit -p .`. Expected: no errors.

```bash
git add backend/src/service/siteProfile.ts backend/src/model/brandModel.ts backend/src/types/brandTypes.ts backend/src/service/validationService.ts backend/src/controller/brandController.ts backend/src/checks/siteProfile.check.ts
git commit -m "feat(brand): site profile, city and sells-products switch"
```

---

### Task 2: Fix guide: neutral words and three service kinds

**Files:**
- Modify: `backend/src/service/fixGuide.ts` (`FixKind` line 7; steps at lines 72, 77, 100, 106, 161, 167, 326, 332; `FIX_GUIDES`; `TEXT_RULES` line 378)
- Test: `backend/src/checks/fixGuide.check.ts`

**Interfaces:**
- Produces: `FixKind` adds `'service-schema' | 'local-listing' | 'service-pages'`. `FIX_GUIDES` has 23 keys. `kindFromText` maps the new texts.

- [ ] **Step 1: Write the failing test.** In `fixGuide.check.ts`:

Add `'local-listing', 'service-pages'` to the `you` array. Add `'service-schema'` to the developer array.

Add these cases to `cases`, before `['Something we have never seen before', 'other']`:

```ts
    ['Add LocalBusiness schema with your address, phone and hours for Sabka Dentist', 'service-schema'],
    ['Add ProfessionalService JSON-LD to the homepage', 'service-schema'],
    ['Get Sabka Dentist listed on Google Business Profile, Justdial and directories like Practo in Mumbai', 'local-listing'],
    ['Collect 20+ verified reviews for Sabka Dentist on Google Business Profile in Mumbai', 'reviews'],
    ['Create separate service pages for root canal and implants', 'service-pages'],
    ['Add FAQPage schema to your main service pages for Sabka Dentist', 'faq-schema'],
```

Add this before `console.log`:

```ts
// 23 kinds, and words that only fit shops stay out of the guides every brand sees
assert.equal(Object.keys(FIX_GUIDES).length, 23)
const PRODUCT_ONLY: FixKind[] = ['product-schema', 'rating-schema', 'description', 'alt-text', 'price-stock', 'product-ids', 'images', 'marketplace', 'collection-schema']
for (const [kind, gd] of Object.entries(FIX_GUIDES)) {
    if (PRODUCT_ONLY.includes(kind as FixKind)) continue
    const all = [gd.forDeveloper, ...gd.steps.shopify, ...gd.steps.other].join(' ')
    assert.ok(!/\bbuyers?\b|after delivery|what you sell|offer a sample\.|offer a sample$/i.test(all), `${kind} has shop-only words: ${all}`)
}
assert.ok(FIX_GUIDES['outreach'].steps.other.join(' ').includes('offer a sample or a free visit'))
```

- [ ] **Step 2: Run it to verify it fails**

Run (in `backend/`): `NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/fixGuide.check.ts`
Expected: FAIL. `FIX_GUIDES['local-listing']` is undefined (TypeError reading `who`).

- [ ] **Step 3: Neutral words** in `fixGuide.ts`. Replace exactly:
  - lines 72 and 77: `'Keep it short: who you are, what you sell, your main product pages and policies.'` → `'Keep it short: who you are, what you offer, your main pages and policies.'`
  - line 100: `'Write 3 to 5 questions buyers ask, with short answers (the Fixes page can write them for you).'` → `'Write 3 to 5 questions customers ask, with short answers (the Fixes page can write them for you).'`
  - line 106: `'Write 3 to 5 questions buyers ask, with short answers.'` → `'Write 3 to 5 questions customers ask, with short answers.'`
  - line 161: `'Turn on review request emails a few days after delivery.'` → `'Turn on review request emails a few days after the order arrives.'`
  - line 167: `'Ask every customer for a review a few days after delivery.'` → `'Ask every customer for a review a few days after the order or visit.'`
  - line 326: `'Send a short, polite email: who you are, why your product fits, and offer a sample.'` → `'Send a short, polite email: who you are, why you fit, and offer a sample or a free visit.'`
  - line 332: `'Send a short, polite email and offer a sample. Follow up once after a week.'` → `'Send a short, polite email and offer a sample or a free visit. Follow up once after a week.'`
  - In the `faq-schema` forDeveloper note and anywhere else, check `grep -n -i "buyer\|deliver\|you sell" src/service/fixGuide.ts`. The only matches left must be inside the PRODUCT_ONLY kinds (`description` line 179 and `marketplace` line 309).

- [ ] **Step 4: New kinds.** Add `| 'service-schema' | 'local-listing' | 'service-pages'` to `FixKind`, before `| 'other'`. Add these constants above `FIX_GUIDES`:

```ts
const SERVICE_SCHEMA_STEPS = [
    'Ask your developer to add LocalBusiness or ProfessionalService schema (JSON-LD) to your homepage.',
    'Give them your business name, address, phone, opening hours and main services.',
    'Use the same name, address and phone as on your Google Business Profile.',
    TEST_RICH
]
const LOCAL_LISTING_STEPS = [
    'Create or claim your free Google Business Profile at business.google.com.',
    'Use the same business name, address and phone everywhere you are listed.',
    'Add photos, opening hours and the services you offer.',
    'List on one or two directories people use for your kind of business, like Justdial, Practo or Sulekha.',
    'Ask happy clients to leave a review there.'
]
const SERVICE_PAGES_STEPS = [
    'Make one page for each main service you offer.',
    'Say what it is, who it is for, and the price or price range.',
    'Add 3 to 5 questions clients ask, with short answers.',
    'Link each page from your menu or homepage.'
]
```

Add these entries to `FIX_GUIDES`, before `other`:

```ts
    'service-schema': g(
        'service-schema',
        'developer',
        'Add LocalBusiness schema',
        SERVICE_SCHEMA_STEPS,
        SERVICE_SCHEMA_STEPS,
        'Add JSON-LD with @type LocalBusiness or a subtype (Dentist, MedicalClinic, LegalService, ProfessionalService) on the homepage: name, address (PostalAddress), telephone, openingHours, url and the services offered. Check it at search.google.com/test/rich-results.'
    ),
    'local-listing': g(
        'local-listing',
        'you',
        'Get listed on Google and local directories',
        LOCAL_LISTING_STEPS,
        LOCAL_LISTING_STEPS,
        'No code needed. If you can, add the Google Business Profile and directory links as sameAs in the Organization or LocalBusiness schema.'
    ),
    'service-pages': g(
        'service-pages',
        'you',
        'Give each service its own page',
        SERVICE_PAGES_STEPS,
        SERVICE_PAGES_STEPS,
        'Each service page should be server-rendered HTML with its own title and meta description, FAQPage schema for its questions, and a link from the navigation.'
    ),
```

- [ ] **Step 5: Text rules.** In `TEXT_RULES`:

Insert right after the `faq-schema` rule:

```ts
    [/localbusiness|professionalservice/i, 'service-schema'],
```

Insert right after the `[/\bfaq\b/i, 'faq-page'],` rule:

```ts
    [/service pages?/i, 'service-pages'],
```

Insert right after the `[/review/i, 'reviews'],` rule. Reviews come first, so "reviews on Google Business Profile" stays a review task:

```ts
    [/google business|justdial|practo|sulekha|director(y|ies)/i, 'local-listing'],
```

- [ ] **Step 6: Run the test.** Same command as Step 2.
Expected: `fixGuide checks: PASS`.

Also run `fixGuideContext.check.ts` and `sendToDeveloper.check.ts` (DB). Expected: PASS.

- [ ] **Step 7: Format, typecheck, commit**

```bash
git add backend/src/service/fixGuide.ts backend/src/checks/fixGuide.check.ts
git commit -m "feat(fix-guide): neutral words and guides for service websites"
```

---

### Task 3: Recommendations by site profile

**Files:**
- Create: `backend/src/service/defaultRecommendations.ts`
- Modify: `backend/src/service/databseService.ts` (`buildRecommendations`, default list at lines ~317-384)
- Modify: `backend/src/service/recommendationService.ts` (`isResolvedByAudit` line 25; prompt in `generateRecommendations` line 69)
- Test: `backend/src/checks/serviceRecommendations.check.ts`

**Interfaces:**
- Consumes: `siteProfile`, `ISiteProfile` (Task 1); kinds `service-schema`, `local-listing` (Task 2).
- Produces: `defaultRecommendations(input: { brandId: string; brandName: string; comp1: string; category: string; profile: ISiteProfile; audit: IAuditData | null }): IRecommendationData[]`

- [ ] **Step 1: Write the failing test** `backend/src/checks/serviceRecommendations.check.ts`

```ts
/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/serviceRecommendations.check.ts
import assert from 'assert'
import aiService from '../service/aiService'
import { defaultRecommendations } from '../service/defaultRecommendations'
import { generateRecommendations } from '../service/recommendationService'
import { siteProfile } from '../service/siteProfile'
import type { IAuditData } from '../types/auditTypes'
import type { IBrand } from '../types/brandTypes'

;(async () => {
    const base = { brandId: 'b1', brandName: 'Hasan Oud', comp1: 'Ajmal', category: 'Fragrances & Perfumes', audit: null }
    // Shops: today's list, word for word
    const shop = defaultRecommendations({ ...base, profile: siteProfile({ businessType: 'ecommerce' }) })
    assert.deepEqual(
        shop.map((r) => r.text),
        [
            'Unblock Google-Extended in robots.txt so Gemini can crawl Hasan Oud',
            'Publish an llms.txt with a clear, structured summary of what Hasan Oud sells',
            'Add FAQPage schema to your top 10 product pages for Hasan Oud',
            'Publish a direct "Hasan Oud vs. Ajmal" comparison page',
            'Collect 20+ verified customer reviews for Hasan Oud on your primary sales channel or Google/Trustpilot',
            'Build a genuine presence in relevant Fragrances & Perfumes subreddits & online forums'
        ]
    )
    assert.ok(shop[1].snippet?.includes('specializing in high-quality products'))

    // A dental clinic in Mumbai: no product talk, local tasks
    const svc = defaultRecommendations({
        ...base,
        brandName: 'Sabka Dentist',
        comp1: 'Clove Dental',
        category: 'HealthTech & Healthcare',
        profile: siteProfile({ businessType: 'service', city: 'Mumbai' })
    })
    const all = svc.map((r) => [r.text, r.reasoning, r.snippet].join(' ')).join(' | ')
    assert.ok(!/product|sales channel|ingredient/i.test(all), `product talk: ${all}`)
    const kinds = svc.map((r) => r.kind)
    assert.ok(kinds.includes('local-listing') && kinds.includes('service-schema'), kinds.join(','))
    assert.ok(svc.some((r) => r.text === 'Add FAQPage schema to your main service pages for Sabka Dentist'))
    assert.ok(svc.some((r) => r.text === 'Collect 20+ verified reviews for Sabka Dentist on Google Business Profile in Mumbai'))
    assert.ok(svc.some((r) => r.text === 'Get Sabka Dentist listed on Google Business Profile, Justdial and directories like Practo in Mumbai'))
    // SaaS: no product talk, no local tasks
    const saas = defaultRecommendations({ ...base, profile: siteProfile({ businessType: 'saas' }) })
    assert.ok(!saas.some((r) => r.kind === 'local-listing' || r.kind === 'service-schema'))
    assert.ok(saas.some((r) => r.text === 'Add FAQPage schema to your main pages for Hasan Oud'))

    // The LocalBusiness task goes once the audit finds that schema
    const audit = { structuredData: [{ name: 'Service / ProfessionalService schema', status: 'Found', badgeType: 'badge-ok' }] } as unknown as IAuditData
    const done = defaultRecommendations({ ...base, audit, profile: siteProfile({ businessType: 'service' }) })
    assert.ok(!done.some((r) => r.kind === 'service-schema'))

    // The AI prompt tells the model the brand sells no products, and gives the city
    let prompt = ''
    ;(aiService as unknown as { callAnyAvailableAi: (p: string) => Promise<null> }).callAnyAvailableAi = async (p: string) => {
        prompt = p
        return null
    }
    const brand = { _id: 'b1', name: 'Sabka Dentist', category: 'HealthTech & Healthcare', businessType: 'service', city: 'Mumbai', website: 'https://sabkadentist.com', competitors: [] } as unknown as IBrand
    await generateRecommendations(brand, {} as IAuditData, [], [])
    assert.ok(prompt.includes('This brand does not sell products.'), 'no-products line')
    assert.ok(prompt.includes('Mumbai'), 'city')
    assert.ok(prompt.includes('local-listing'), 'new kinds listed')
    await generateRecommendations({ ...brand, businessType: 'ecommerce' } as unknown as IBrand, {} as IAuditData, [], [])
    assert.ok(!prompt.includes('does not sell products'), 'shop prompt unchanged')

    console.log('serviceRecommendations checks: PASS')
    process.exit(0)
})().catch((e) => {
    console.error(e)
    process.exit(1)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run (in `backend/`): `NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/serviceRecommendations.check.ts`
Expected: FAIL with "Cannot find module '../service/defaultRecommendations'".

- [ ] **Step 3: Write `backend/src/service/defaultRecommendations.ts`.** The shop entries are moved verbatim from `databseService.buildRecommendations`. Cut the whole `defaultList` array from there.

```ts
import type { IAuditData } from '../types/auditTypes'
import type { IRecommendationData } from '../types/recommendationTypes'
import type { ISiteProfile } from './siteProfile'
import { isResolvedByAudit } from './recommendationService'

// The built-in list, used when the AI gives none. Shops get the original list; other sites get the same tasks
// without product talk, and service and local businesses get two local tasks
export const defaultRecommendations = (input: {
    brandId: string
    brandName: string
    comp1: string
    category: string
    profile: ISiteProfile
    audit: IAuditData | null
}): IRecommendationData[] => {
    const { brandId, brandName, comp1, category, profile, audit } = input
    const shop = profile.sellsProducts
    const local = profile.type === 'service' || profile.type === 'local'
    const inCity = profile.city ? ` in ${profile.city}` : ''
    const faqPages = shop ? 'top 10 product pages' : local ? 'main service pages' : 'main pages'

    const list: IRecommendationData[] = [
        {
            brandId,
            text: `Unblock Google-Extended in robots.txt so Gemini can crawl ${brandName}`,
            kind: 'crawler-access',
            category: 'Technical',
            effort: 'Low effort',
            impact: 'High impact',
            reasoning: 'AI search crawlers (Google-Extended, GPTBot, ClaudeBot) need explicit robots.txt permissions to index your domain.',
            snippet: `User-agent: Google-Extended\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /`,
            isCompleted: false
        },
        {
            brandId,
            text: `Publish an llms.txt with a clear, structured summary of what ${brandName} ${shop ? 'sells' : 'offers'}`,
            kind: 'llms-txt',
            category: 'Technical',
            effort: 'Low effort',
            impact: 'Medium impact',
            reasoning: 'llms.txt acts as a standardized machine-readable summary that AI LLMs ingest during live retrieval.',
            snippet: shop
                ? `# ${brandName}\n> ${category} brand specializing in high-quality products.\n\n## Key facts\n- Quality tested & certified\n- Direct to consumer shipping\n- Founded with sustainable practices`
                : `# ${brandName}\n> ${category}: what we offer and who it is for.\n\n## Services\n- Main service 1\n- Main service 2\n\n## Contact\n- Address, city and phone`,
            isCompleted: false
        },
        {
            brandId,
            text: `Add FAQPage schema to your ${faqPages} for ${brandName}`,
            kind: 'faq-schema',
            category: 'Content',
            effort: 'Medium effort',
            impact: 'High impact',
            reasoning: 'Structured JSON-LD FAQ schemas provide direct question-and-answer pairs that LLMs extract for user queries.',
            snippet: shop
                ? `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "FAQPage",\n  "mainEntity": [{\n    "@type": "Question",\n    "name": "Is ${brandName} suitable for daily use?",\n    "acceptedAnswer": {\n      "@type": "Answer",\n      "text": "Yes, ${brandName} products are formulated for safe daily routines."\n    }\n  }]\n}\n</script>`
                : `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "FAQPage",\n  "mainEntity": [{\n    "@type": "Question",\n    "name": "How much does ${brandName} charge?",\n    "acceptedAnswer": {\n      "@type": "Answer",\n      "text": "It depends on the service. Each service page shows the price range, or call us for a quote."\n    }\n  }]\n}\n</script>`,
            isCompleted: false
        },
        {
            brandId,
            text: `Publish a direct "${brandName} vs. ${comp1}" comparison page`,
            kind: 'comparison-page',
            category: 'Content',
            effort: 'Medium effort',
            impact: 'High impact',
            reasoning: 'AI users frequently ask comparative queries ("X vs Y"). High-ranking comparison pages train LLM sentiment.',
            snippet: shop
                ? `# ${brandName} vs ${comp1}: Complete Comparison Guide\n\n- Key Ingredients & Benefits\n- Pricing & Value Comparison\n- Customer Ratings & Verified Reviews`
                : `# ${brandName} vs ${comp1}: Complete Comparison Guide\n\n- Services & Experience\n- Pricing & Value Comparison\n- Client Ratings & Verified Reviews`,
            isCompleted: false
        },
        {
            brandId,
            text: shop
                ? `Collect 20+ verified customer reviews for ${brandName} on your primary sales channel or Google/Trustpilot`
                : `Collect 20+ verified reviews for ${brandName} on Google Business Profile${inCity}`,
            kind: 'reviews',
            category: 'Off-site',
            effort: 'High effort',
            impact: 'High impact',
            reasoning: shop
                ? 'Off-site review volume on verified customer channels serves as a strong trust signal for generative AI answer engines.'
                : 'Reviews on Google Business Profile and trusted directories are a strong trust signal for AI answer engines.',
            isCompleted: false
        },
        ...(local && !shop
            ? [
                  {
                      brandId,
                      text: `Add LocalBusiness schema with your address, phone and hours for ${brandName}`,
                      kind: 'service-schema' as const,
                      category: 'Technical' as const,
                      effort: 'Low effort' as const,
                      impact: 'High impact' as const,
                      reasoning: 'AI engines read LocalBusiness schema to learn where you are, when you are open and what you offer.',
                      snippet: `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "LocalBusiness",\n  "name": "${brandName}",\n  "address": { "@type": "PostalAddress", "addressLocality": "${profile.city}", "addressCountry": "IN" },\n  "telephone": "",\n  "openingHours": "Mo-Sa 10:00-20:00"\n}\n</script>`,
                      isCompleted: false
                  },
                  {
                      brandId,
                      text: `Get ${brandName} listed on Google Business Profile, Justdial and directories like Practo in ${profile.place}`,
                      kind: 'local-listing' as const,
                      category: 'Off-site' as const,
                      effort: 'Medium effort' as const,
                      impact: 'High impact' as const,
                      reasoning: 'AI answers to local questions often come from Google Business Profile and directories like Justdial and Practo.',
                      isCompleted: false
                  }
              ]
            : []),
        {
            brandId,
            text: `Build a genuine presence in relevant ${category} subreddits & online forums`,
            kind: 'forums',
            category: 'Off-site',
            effort: 'High effort',
            impact: 'Medium impact',
            reasoning: 'Community forums like Reddit and Quora are primary sources for AI search indexing and user citations.',
            isCompleted: false
        }
    ]
    return list.filter((r) => !isResolvedByAudit(r.text, audit))
}
```

If `IRecommendationData['kind']` is typed as `FixKind`, the `as const` casts compile. If tsc complains about the spread array, type the inner array as `IRecommendationData[]` instead of using `as const` per field.

- [ ] **Step 4: Use it in `databseService.buildRecommendations`.** Replace everything from `const defaultList: IRecommendationData[] = [` through `return defaultList.filter((r) => !isResolvedByAudit(r.text, audit))` with:

```ts
        return defaultRecommendations({ brandId, brandName, comp1, category, profile: siteProfile(brand), audit })
```

Add the imports:

```ts
import { defaultRecommendations } from './defaultRecommendations'
import { siteProfile } from './siteProfile'
```

Drop `isResolvedByAudit` from the recommendationService import if nothing else in the file uses it (check with grep).

- [ ] **Step 5: `isResolvedByAudit`.** In `recommendationService.ts`, add as the first rule after `if (!audit) return false`:

```ts
    if (/localbusiness|professionalservice/i.test(text) && /schema/i.test(text)) return isOk(audit.structuredData, /LocalBusiness|ProfessionalService/i)
```

- [ ] **Step 6: The AI prompt.** In `generateRecommendations`, add before `const prompt =`:

```ts
    const profile = siteProfile(brand)
    const extra = [
        profile.sellsProducts
            ? ''
            : '8. This brand does not sell products. Do not suggest product pages, Product schema, product feeds or marketplaces like Amazon or Flipkart.',
        profile.city ? `9. The business is in ${profile.city}; use the city in local tasks.` : ''
    ]
        .filter(Boolean)
        .join('\n    ')
```

Change the line `    7. Do not recommend anything the audit already shows as found or allowed.` to:

```ts
    7. Do not recommend anything the audit already shows as found or allowed.
    ${extra}
```

Add `import { siteProfile } from './siteProfile'`. The `kind` list already comes from `FIX_GUIDES`, so it now lists the three new kinds.

- [ ] **Step 7: Run tests.** Run the Step 2 command. Expected: PASS.

Also run `recommendations.check.ts` (DB). Expected: `recommendations checks: PASS`.

- [ ] **Step 8: Format, typecheck, commit**

```bash
git add backend/src/service/defaultRecommendations.ts backend/src/service/databseService.ts backend/src/service/recommendationService.ts backend/src/checks/serviceRecommendations.check.ts
git commit -m "feat(recommendations): tasks for websites that don't sell products"
```

---

### Task 4: Website audit and AI crawler view by site profile

**Files:**
- Modify: `backend/src/service/auditService.ts` (FAQ issue line ~397; platform links ~lines 431-445; marketplace block ~lines 524-563; product checks ~line 594)
- Modify: `backend/src/service/aiViewService.ts` (`compareFacts` line 136, `hasFact` line ~171, `scorePage` line 173, `runAiView` line 240)
- Modify: `backend/src/controller/auditController.ts` (line 95: `runAiView(brand.website)`)
- Test: `backend/src/checks/serviceAudit.check.ts`

**Interfaces:**
- Consumes: `siteProfile` (Task 1).
- Produces, from `auditService.ts`:
  - `faqIssueText(profile: ISiteProfile): string`
  - `platformsIn(href: string): string[]`
  - `shouldRunProductChecks(fetchSuccess: boolean, profile: ISiteProfile): boolean`
  - `listingsEmptyName(profile: ISiteProfile): string`, which returns the empty-row name
- Produces, from `aiViewService.ts`:
  - `compareFacts(ai, shopper, shopify = false, products = true)`
  - `scorePage(ai, shopper, products = true)`
  - `runAiView(website, productUrl?, products = true)`

- [ ] **Step 1: Write the failing test** `backend/src/checks/serviceAudit.check.ts`

```ts
/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/serviceAudit.check.ts
import assert from 'assert'
import { faqIssueText, platformsIn, shouldRunProductChecks, listingsEmptyName } from '../service/auditService'
import { compareFacts, scorePage, extractPageFacts } from '../service/aiViewService'
import { siteProfile } from '../service/siteProfile'

const shop = siteProfile({ businessType: 'ecommerce' })
const svc = siteProfile({ businessType: 'service' })

assert.equal(faqIssueText(shop), 'FAQPage schema missing on homepage and product pages (Limits direct AI answers and search snippet citations)')
assert.equal(faqIssueText(svc), 'FAQPage schema missing on homepage and main pages (Limits direct AI answers and search snippet citations)')

// Product page audit and feed check only for sites that sell products (and only when the homepage opened)
assert.equal(shouldRunProductChecks(true, shop), true)
assert.equal(shouldRunProductChecks(false, shop), false)
assert.equal(shouldRunProductChecks(true, svc), false)
assert.equal(shouldRunProductChecks(true, siteProfile({ businessType: 'service', sellsProducts: true })), true)

// Directories count as listings; the old platforms still do
assert.deepEqual(platformsIn('https://www.justdial.com/Mumbai/Sabka-Dentist'), ['Justdial Listing'])
assert.deepEqual(platformsIn('https://www.practo.com/mumbai/clinic/sabka-dentist'), ['Practo Profile'])
assert.deepEqual(platformsIn('https://g.page/sabkadentist'), ['Google Business Profile'])
assert.deepEqual(platformsIn('https://maps.app.goo.gl/abc'), ['Google Business Profile'])
assert.deepEqual(platformsIn('https://www.google.com/maps/place/Sabka'), ['Google Business Profile'])
assert.deepEqual(platformsIn('https://www.capterra.com/p/1/x'), ['Capterra Profile'])
assert.deepEqual(platformsIn('https://www.amazon.in/stores/x'), ['Amazon Store'])
assert.deepEqual(platformsIn('https://www.g2.com/products/x'), ['G2 Directory Profile'])
assert.deepEqual(platformsIn('https://example.com/about'), [])
assert.equal(listingsEmptyName(shop), 'Marketplace & Sales Channels')
assert.equal(listingsEmptyName(svc), 'Listings & directories')

// AI crawler view: a site without products has no price, rating or Product schema rows
const html = '<html><head><title>Sabka Dentist</title><script type="application/ld+json">{"@type":"Dentist","name":"Sabka"}</script></head><body><h1>Sabka Dentist</h1></body></html>'
const f = extractPageFacts(html)
assert.deepEqual(compareFacts(f, f).map((r) => r.key), ['name', 'price', 'rating', 'description', 'schema'])
const rows = compareFacts(f, f, false, false)
assert.deepEqual(rows.map((r) => r.key), ['name', 'description', 'schema'])
assert.equal(rows[0].label, 'Name')
assert.equal(rows[2].label, 'Schema markup')
assert.equal(rows[2].ai, 'Found')
const s = scorePage(f, f, false)
assert.ok(s.total !== null && s.total <= 3)

console.log('serviceAudit checks: PASS')
process.exit(0)
```

- [ ] **Step 2: Run it to verify it fails**

Run (in `backend/`): `NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/serviceAudit.check.ts`
Expected: FAIL. `faqIssueText is not a function`.

- [ ] **Step 3: Helpers in `auditService.ts`.** Add near the top, after the imports, together with `import { siteProfile, type ISiteProfile } from './siteProfile'`:

```ts
export const faqIssueText = (profile: ISiteProfile) =>
    `FAQPage schema missing on homepage and ${profile.pagesWord} (Limits direct AI answers and search snippet citations)`
// Product page audit and feed check: only for sites that sell products, and only when the homepage opened
export const shouldRunProductChecks = (fetchSuccess: boolean, profile: ISiteProfile) => fetchSuccess && profile.sellsProducts
export const listingsEmptyName = (profile: ISiteProfile) => (profile.sellsProducts ? 'Marketplace & Sales Channels' : 'Listings & directories')

// Sales channels, B2B listings, software and local directories linked from the homepage (first matches kept in order)
const PLATFORM_LINKS: Array<[RegExp, string]> = [
    [/indiamart\.com/, 'IndiaMART B2B Listing'],
    [/tradeindia\.com/, 'TradeIndia B2B Listing'],
    [/exportersindia\.com/, 'ExportersIndia Profile'],
    [/amazon\./, 'Amazon Store'],
    [/flipkart\./, 'Flipkart Store'],
    [/meesho\./, 'Meesho Store'],
    [/jiomart\.com/, 'JioMart Store'],
    [/nykaa\./, 'Nykaa Store'],
    [/myntra\./, 'Myntra Store'],
    [/shopify\./, 'Shopify Store'],
    [/etsy\./, 'Etsy Store'],
    [/blinkit\.com/, 'Blinkit Listing'],
    [/zepto/, 'Zepto Listing'],
    [/g2\.com/, 'G2 Directory Profile'],
    [/capterra\.com/, 'Capterra Profile'],
    [/justdial\.com/, 'Justdial Listing'],
    [/practo\.com/, 'Practo Profile'],
    [/sulekha\.com/, 'Sulekha Listing'],
    [/g\.page\/|maps\.app\.goo\.gl|google\.[a-z.]+\/maps/, 'Google Business Profile']
]
export const platformsIn = (href: string): string[] => {
    const h = href.toLowerCase()
    return PLATFORM_LINKS.filter(([re]) => re.test(h)).map(([, name]) => name)
}
```

- [ ] **Step 4: Use them in the audit function.**
  - Right after `const bType = brand.businessType || 'ecommerce'`, add `const profile = siteProfile(brand)`. If `profile` is needed outside that `if (fetchSuccess && htmlContent)` block, declare `const profile = siteProfile(brand)` once near the start of the audit function instead, where `brand` is loaded.
  - Replace `htmlIssues.push('FAQPage schema missing on homepage and product pages (Limits direct AI answers and search snippet citations)')` with `htmlIssues.push(faqIssueText(profile))`.
  - Replace the 14 `if (lowerHref.includes(...)) detectedPlatforms.push(...)` lines (from `indiamart.com` to `g2.com`) with:

    ```ts
                    for (const name of platformsIn(href)) detectedPlatforms.push({ name, url: href })
    ```

  - In the marketplace block:
    - Change `name: 'Structured Product Schema',` to `name: profile.sellsProducts ? 'Structured Product Schema' : 'Structured data for listings',`.
    - Change `name: 'Marketplace & Sales Channels',` to `name: listingsEmptyName(profile),`.
  - Change `if (fetchSuccess) {`, the one guarding `storeAuditForBrand` and `runFeedHealth`, to `if (shouldRunProductChecks(fetchSuccess, profile)) {`. The existing code already keeps saved results when these stay `undefined`.

- [ ] **Step 5: AI view in `aiViewService.ts`.**
  - `compareFacts` signature: `export const compareFacts = (ai: IPageFacts, shopper: IPageFacts | null, shopify = false, products = true): IFactRow[] => {`. Inside, after `hasProduct`, add:

    ```ts
        // Sites without products: only the facts every page has; any schema counts
        if (!products) {
            const hasSchema = (f: IPageFacts) => (f.schemaTypes.length ? 'Found' : null)
            return [
                row('name', 'Name', ai.name, shopper?.name ?? null, !ai.name && !!shopper?.name),
                row(
                    'description',
                    'Description',
                    `${ai.words} words`,
                    shopper ? `${shopper.words} words` : null,
                    !!shopper && shopper.words >= 50 && ai.words < shopper.words / 2
                ),
                row('schema', 'Schema markup', hasSchema(ai), shopper ? hasSchema(shopper) : null, !hasSchema(ai) && !!shopper && !!hasSchema(shopper))
            ]
        }
    ```

  - `hasFact`: `const hasFact = (f: IPageFacts, key: IFactRow['key'], products = true) => key === 'description' ? f.words >= 50 : key === 'schema' ? (products ? f.schemaTypes.includes('product') : f.schemaTypes.length > 0) : !!f[key]`
  - `scorePage`: signature `(ai: IPageFacts, shopper: IPageFacts | null, products = true)`. Use `compareFacts(ai, shopper, false, products)`, and pass `products` to both `hasFact` calls.
  - `runAiView`: signature `(website: string, productUrl?: string, products = true)`. Product target: `const product = productUrl || (products && homeHtml ? productLinksIn(homeHtml, home)[0] : undefined)`. In the loop use `compareFacts(ai, shopperFacts, isShopifyHtml(raw), products)` and `scorePage(ai, shopperFacts, products)`.

- [ ] **Step 6: Controller.** In `auditController.ts` line 95, change `runAiView(brand.website)` to `runAiView(brand.website, undefined, siteProfile(brand).sellsProducts)`. Add `import { siteProfile } from '../service/siteProfile'`. The product-page call at line 84 passes an explicit URL, so it stays as is.

- [ ] **Step 7: Run tests.** Run the Step 2 command. Expected: PASS.

Also run `aiView.check.ts`, `storeAudit.check.ts` and `fixGuideContext.check.ts` with DATABASE_URL none. Expected: PASS.

- [ ] **Step 8: Format, typecheck, commit**

```bash
git add backend/src/service/auditService.ts backend/src/service/aiViewService.ts backend/src/controller/auditController.ts backend/src/checks/serviceAudit.check.ts
git commit -m "feat(audit): no product checks or product wording for service websites"
```

---

### Task 5: Query templates and AI query prompt by site profile

**Files:**
- Modify: `backend/src/service/querySuggestionService.ts` (`templateQueries` line 326, `promptFor` line 404, `suggestQueries` line 426)
- Modify: `backend/src/controller/brandController.ts` (`getQueryTemplates` ~line 348, `suggestQueries` ~line 384)
- Test: `backend/src/checks/serviceQueries.check.ts`

**Interfaces:**
- Consumes: `siteProfile`, `ISiteProfile` (Task 1).
- Produces:
  - `templateQueries(category: string, brandName?: string, profile?: Pick<ISiteProfile, 'type' | 'place'>): ISuggestedQuery[]`
  - `serviceNoun(category: string): string`
  - `export const promptFor(brand: { name; website?; category; region?; profile?: Pick<ISiteProfile, 'type' | 'city' | 'place'> })`
  - The `suggestQueries` brand argument accepts `profile`.
  - `GET /queries/templates` accepts `businessType` and `city`.

- [ ] **Step 1: Write the failing test** `backend/src/checks/serviceQueries.check.ts`

```ts
/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/serviceQueries.check.ts
import assert from 'assert'
import { promptFor, serviceNoun, templateQueries } from '../service/querySuggestionService'
import { siteProfile } from '../service/siteProfile'

assert.equal(serviceNoun('HealthTech & Healthcare'), 'healthcare service')
assert.equal(serviceNoun('Professional & Business Services'), 'professional service')
assert.equal(serviceNoun('Real Estate & Property'), 'real estate service')
assert.equal(serviceNoun('Dental Clinic'), 'dental clinic')
assert.equal(serviceNoun('FinTech'), 'local service')

const svc = siteProfile({ businessType: 'service', city: 'Mumbai' })
const list = templateQueries('HealthTech & Healthcare', 'Sabka Dentist', svc)
const texts = list.map((q) => q.text)
assert.equal(texts.length, 6, texts.join(' | '))
assert.equal(texts[0], 'Best healthcare service in Mumbai')
assert.ok(texts.some((t) => t === 'Mumbai me accha aur trusted healthcare service kaun sa hai'))
assert.equal(texts[5], 'Sabka Dentist reviews: kaisa hai, bharosa kar sakte hain?')
assert.ok(!texts.some((t) => /original|app\b|pharmacy|delivery/i.test(t)), texts.join(' | '))
// No city: "India"
assert.equal(templateQueries('HealthTech & Healthcare', '', siteProfile({ businessType: 'local_business' }))[0].text, 'Best healthcare service in India')
// SaaS and media get their own lists
assert.ok(templateQueries('SaaS & Software', '', siteProfile({ businessType: 'saas' }))[0].text.includes('software'))
assert.ok(templateQueries('Media, Gaming & Entertainment', '', siteProfile({ businessType: 'content_media' }))[0].text.includes('websites'))
// Shops: unchanged
assert.deepEqual(templateQueries('Fragrances & Perfumes', 'Hasan Oud', siteProfile({ businessType: 'ecommerce' })), templateQueries('Fragrances & Perfumes', 'Hasan Oud'))

// The AI prompt for a service talks about clients and the city, not shoppers and products
const p = promptFor({ name: 'Sabka Dentist', website: 'https://sabkadentist.com', category: 'HealthTech & Healthcare', region: 'India', profile: svc })
assert.ok(p.includes('clients') && p.includes('Mumbai') && !/shopper|products like/i.test(p), p)
const shopPrompt = promptFor({ name: 'Hasan Oud', category: 'Fragrances & Perfumes' })
assert.ok(shopPrompt.includes('Indian shoppers'))

console.log('serviceQueries checks: PASS')
process.exit(0)
```

- [ ] **Step 2: Run it to verify it fails**

Run (in `backend/`): `NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/serviceQueries.check.ts`
Expected: FAIL. `serviceNoun` / `promptFor` is not exported (TypeError: not a function).

- [ ] **Step 3: Templates.** In `querySuggestionService.ts`, add `import type { ISiteProfile } from './siteProfile'`. Above `templateQueries`, add:

```ts
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
// The first part of the category that isn't a "...Tech" word: "HealthTech & Healthcare" → "healthcare"
const firstPart = (category: string, skip: RegExp) =>
    category
        .split(/[&,/]/)
        .map((p) => p.trim().toLowerCase())
        .find((p) => p && !skip.test(p))
export const serviceNoun = (category: string): string => {
    const base = firstPart(category, /tech$/) || 'local'
    return /(services?|agency|clinic|studio)$/.test(base) ? base : `${base} service`
}

// Questions clients ask before choosing a service, a tool or a source (no shopping words)
const nonShopTemplates = (category: string, profile: Pick<ISiteProfile, 'type' | 'place'>): ISuggestedQuery[] => {
    const place = profile.place
    if (profile.type === 'saas') {
        const n = firstPart(category, /tech$|^saas$|^software$/) || 'business'
        return [
            q(`Best ${n} software for small business in India`, 'EN', 'Best-of'),
            q(`${cap(n)} software ka free alternative kaunsa hai`, 'HI-EN', 'Price'),
            q(`Which ${n} tool is easiest for a small team`, 'EN', 'Comparison'),
            q(`${cap(n)} software pricing comparison India`, 'EN', 'Price')
        ]
    }
    if (profile.type === 'media') {
        const n = firstPart(category, /tech$/) || 'news'
        return [
            q(`Best ${n} websites in India`, 'EN', 'Best-of'),
            q(`${cap(n)} news ke liye sabse bharosemand source kaunsa hai`, 'HI-EN', 'Best-of'),
            q(`Where to read reliable ${n} updates`, 'EN', 'Direct')
        ]
    }
    const n = serviceNoun(category)
    return [
        q(`Best ${n} in ${place}`, 'EN', 'Best-of'),
        q(`${place} me accha aur trusted ${n} kaun sa hai`, 'HI-EN', 'Best-of'),
        q(`${cap(n)} ka kharcha kitna hota hai`, 'HI-EN', 'Price'),
        q(`${cap(n)} near me with good reviews`, 'EN', 'Direct'),
        q(`Affordable ${n} in ${place} for families`, 'EN', 'Price')
    ]
}
```

Replace `templateQueries` with:

```ts
export const templateQueries = (category: string, brandName?: string, profile?: Pick<ISiteProfile, 'type' | 'place'>): ISuggestedQuery[] => {
    const shop = !profile || profile.type === 'shop'
    const vertical = detectVertical(category)
    const list = !shop
        ? nonShopTemplates(category, profile)
        : vertical === 'generic'
          ? genericTemplates(category)
          : [...nicheTemplates(category, vertical), ...TEMPLATES[vertical]]
    const brand = (brandName || '').trim()
    // One branded question, last, so small plans keep the unbranded discovery questions
    if (brand)
        list.push(
            shop
                ? q(`${brand} reviews: original aur value for money hai ya nahi?`, 'HI-EN', 'Direct')
                : q(`${brand} reviews: kaisa hai, bharosa kar sakte hain?`, 'HI-EN', 'Direct')
        )
    return list
}
```

(Prettier may reformat the nested ternary. That is fine.)

- [ ] **Step 4: Prompt.** Change `const promptFor = (brand: { name: string; website?: string; category: string; region?: string }) => {` to `export const promptFor = (brand: { name: string; website?: string; category: string; region?: string; profile?: Pick<ISiteProfile, 'type' | 'city' | 'place'> }) => {`. At the start of its body, add:

```ts
    const profile = brand.profile
    if (profile && profile.type !== 'shop') {
        const examples = templateQueries(brand.category, undefined, profile)
            .slice(0, 3)
            .map((t) => `- ${t.text}`)
            .join('\n')
        const what = { service: 'a service provider', local: 'a local business', saas: 'a software tool', media: 'a news or content source' }[profile.type]
        const inCity = profile.city ? ` in ${profile.city}` : ''
        return `You help an Indian business find the questions its clients ask ChatGPT, Gemini and Perplexity before choosing ${what}.
Brand: ${brand.name}${brand.website ? ` (${brand.website})` : ''}
Category: ${brand.category}
Market: ${brand.region || 'India'}${profile.city ? `\nCity: ${profile.city}` : ''}

Write ${MAX_SUGGESTIONS} questions real Indian clients would type when looking for a service like this brand offers${inCity}.
- Do NOT include the brand name ${brand.name}; these are discovery questions.
- Mix Hinglish (Hindi in Roman script, e.g. "ke liye", "sabse accha", "kaun sa") and simple English, about half each.
- Cover cost ("kharcha kitna", "fees"), "near me", trust and reviews, and urgency ("aaj hi", "emergency").
- Short, the way people type: 4 to 14 words. No numbering, no quotes.
Examples of the style:
${examples}

Reply with JSON only: [{"text": "...", "lang": "EN" | "HI-EN", "intent": "Best-of" | "Price" | "Occasion" | "Comparison" | "Direct" | "How-to"}]`
    }
```

The rest of the function (the shop prompt) stays unchanged. In `suggestQueries`, widen its `brand` parameter type to the same shape, including `profile?`. It already passes `brand` to `promptFor`. Check that, and if it passes picked fields instead, add `profile: brand.profile`.

- [ ] **Step 5: Controller.**
  - In `getQueryTemplates`:

    ```ts
                const businessType = typeof req.query.businessType === 'string' ? req.query.businessType.slice(0, 40) : ''
                const city = typeof req.query.city === 'string' && CITY_RE.test(req.query.city) ? req.query.city : ''
    ```

    Then use `templateQueries(category, brand, siteProfile({ businessType, city }))`.
  - In `suggestQueries`, change the call to `suggestQueriesWithAi({ name: brand.name, website: brand.website, category: brand.category, region: brand.region, profile: siteProfile(brand) }, existing)`.
  - Add the import `import { CITY_RE, siteProfile } from '../service/siteProfile'`.

- [ ] **Step 6: Run tests.** Run the Step 2 command. Expected: PASS.

Also run `indianQueries.check.ts` and `freeCheck.check.ts` with DATABASE_URL none. Expected: PASS.

- [ ] **Step 7: Format, typecheck, commit**

```bash
git add backend/src/service/querySuggestionService.ts backend/src/controller/brandController.ts backend/src/checks/serviceQueries.check.ts
git commit -m "feat(queries): questions for service, local, SaaS and media brands"
```

---

### Task 6: Frontend: hide product features, city field, switch, wording

**Files:**
- Create: `frontend/src/utils/siteType.ts`
- Modify: `frontend/src/components/AppLayout.tsx` (brand type line 9, `navItems` line 67, Outlet context line ~132)
- Modify: `frontend/src/pages/Overview.tsx` (`OutletContextType` line 49, `ProductsCard` line 145)
- Modify: `frontend/src/pages/WebsiteAudit.tsx` (`OutletContextType` line 28, StoreAuditPanel + feed line ~372-377, marketplace panel ~454-466)
- Modify: `frontend/src/pages/Settings.tsx` (state ~137, load ~235, save ~514, brand form ~893-920, query placeholder ~1180, `ProductsSettings` line 1210, `BrandData` type ~84)
- Modify: `frontend/src/pages/Onboarding.tsx` (state ~71, step 1 fields ~448-473, `loadTemplates` line 141 + deps line 164, POST ~340)
- Modify: `frontend/src/utils/queryTemplates.ts` (`fetchQueryTemplates`)

**Interfaces:**
- Consumes: the brand JSON fields `sellsProducts: boolean`, `businessType`, `city` (Task 1); the template endpoint params `businessType`, `city` (Task 5).
- Produces: AppLayout outlet context adds `updateBrand(id: string, patch: { sellsProducts?: boolean; businessType?: string; city?: string }) => void`.

- [ ] **Step 1: `frontend/src/utils/siteType.ts`**

```ts
// Mirrors the backend's siteProfile type (the brand API already sends the computed sellsProducts)
export type SiteType = 'shop' | 'service' | 'local' | 'saas' | 'media';
const TYPES: Record<string, SiteType> = { service: 'service', local_business: 'local', saas: 'saas', content_media: 'media' };
export const siteTypeOf = (businessType?: string): SiteType => TYPES[businessType || ''] || 'shop';
export const hasCity = (businessType?: string) => businessType === 'service' || businessType === 'local_business';

export const listingsCopy = (t: SiteType) => {
  if (t === 'shop')
    return {
      title: 'Marketplace & Sales Channels',
      tip: 'Verifies linked sales platforms (IndiaMART, Amazon, Flipkart, Shopify, G2, etc.).',
      impact: 'AI shopping assistants fetch product specs and reviews directly from these linked marketplaces to recommend your products.',
      sub: 'AI engines (ChatGPT, Gemini, Perplexity) fetch product listings and reviews directly from platforms linked on your website (IndiaMART, Amazon, Shopify, G2, etc.)',
    };
  const names = t === 'saas' ? 'G2 and Capterra' : t === 'media' ? 'Google News and Wikipedia' : 'Google Business Profile, Justdial, Practo and Sulekha';
  return {
    title: 'Listings & directories',
    tip: `Checks links from your website to ${names}.`,
    impact: `AI answers often quote ${names} when they recommend a business like yours.`,
    sub: `AI engines (ChatGPT, Gemini, Perplexity) read listings on ${names} when they are linked from your website.`,
  };
};

export const queryExample = (t: SiteType) =>
  t === 'service' || t === 'local'
    ? 'Best dental clinic in Mumbai'
    : t === 'saas'
      ? 'Best invoicing software for small business'
      : t === 'media'
        ? 'Most reliable cricket news website'
        : 'Best skincare product for dry skin';
```

- [ ] **Step 2: AppLayout.**
  - Brand state type: add `sellsProducts?: boolean; businessType?: string; city?: string` to the item type in `useState<Array<{ ... }>>` (line 9) and in the `fetchedBrands` annotation (line 25).
  - After `setScannedAt`, add:

    ```tsx
      // Settings passes saved brand changes up, so the menu follows without a reload
      const updateBrand = useCallback((brandId: string, patch: { sellsProducts?: boolean; businessType?: string; city?: string }) => {
        setBrands((prev) => prev.map((b) => (b._id === brandId ? { ...b, ...patch } : b)));
      }, []);
    ```

  - Replace `const navItems = [` … `];` so it is filtered:

    ```tsx
      const sellsProducts = brands.find((b) => b._id === currentBrand._id)?.sellsProducts !== false;
      const navItems = [
        ...existing items unchanged...
      ].filter((item) => item.path !== '/products' || sellsProducts);
    ```

  - Outlet: `<Outlet context={{ currentBrand, brands, setCurrentBrand, setScannedAt, updateBrand }} />`

- [ ] **Step 3: Overview.** Add `sellsProducts?: boolean` to the `brands` item type in `OutletContextType`. After `const activeBrandId = ...`, add:

```tsx
  const sellsProducts = context?.brands?.find((b) => b._id === activeBrandId)?.sellsProducts !== false;
```

Change line 145 to `{sellsProducts && <ProductsCard brandId={activeBrandId} key={activeBrandId} />}`.

- [ ] **Step 4: WebsiteAudit.**
  - Add `sellsProducts?: boolean; businessType?: string` to the `brands` item type.
  - After `activeBrandId`:

    ```tsx
      const activeBrand = context?.brands?.find((b) => b._id === activeBrandId);
      const sellsProducts = activeBrand?.sellsProducts !== false;
      const listings = listingsCopy(siteTypeOf(activeBrand?.businessType));
    ```

  - Wrap the `<StoreAuditPanel ... />` line and the `{auditData?.feedHealth?.shopify && ...}` block after it in `{sellsProducts && (<> ... </>)}`.
  - In the marketplace panel, replace:
    - the `<span>Marketplace & Sales Channels</span>` text with `{listings.title}`;
    - the InfoTooltip `title`, `description` and `geoImpact` with `listings.title`, `listings.tip` and `listings.impact`;
    - the `<p className="sub">` text with `{listings.sub}`.
  - Import `listingsCopy` and `siteTypeOf` from `'../utils/siteType'`.

- [ ] **Step 5: Settings.**
  - In `BrandData`, add `sellsProducts?: boolean; city?: string`.
  - Add the state `const [brandSellsProducts, setBrandSellsProducts] = useState(true);` and `const [brandCity, setBrandCity] = useState('');` next to `brandBusinessType`.
  - Where the brand loads (after `setBrandRegion(b.region || 'India');`), add `setBrandSellsProducts(b.sellsProducts !== false); setBrandCity(b.city || '');`.
  - In `handleSaveBrand`, add to the PATCH body:

    ```tsx
            // Matching the type's default saves null, so a later type change still decides
            sellsProducts: brandSellsProducts === (brandBusinessType === 'ecommerce') ? null : brandSellsProducts,
            city: hasCity(brandBusinessType) ? brandCity.trim() : '',
    ```

  - After `setBrands(...)` there, add `outletCtx?.updateBrand?.(selectedBrandId, { sellsProducts: updatedBrand?.sellsProducts, businessType: updatedBrand?.businessType, city: updatedBrand?.city });`. Add `updateBrand?: (...)` to Settings' `OutletContextType`.
  - In the brand form, after the Primary market field `</div>`, add:

    ```tsx
                    {hasCity(brandBusinessType) && (
                      <div className="field">
                        <label>City or area (optional)</label>
                        <input type="text" maxLength={60} placeholder="e.g. Mumbai or Andheri West" value={brandCity} onChange={(e) => setBrandCity(e.target.value)} />
                      </div>
                    )}
                    <div className="field">
                      <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input type="checkbox" checked={brandSellsProducts} onChange={(e) => setBrandSellsProducts(e.target.checked)} />
                        I sell products on this website
                      </label>
                      <p className="sub" style={{ fontSize: '12.5px', margin: '4px 0 0' }}>Turn off to hide Products and product page checks.</p>
                    </div>
    ```

  - Query placeholder: replace `"Add a custom query (e.g. Best skincare product for dry skin)..."` with `` `Add a custom query (e.g. ${queryExample(siteTypeOf(brandBusinessType))})...` ``.
  - `ProductsSettings`: use `{brands.find((b) => b._id === selectedBrandId)?.sellsProducts !== false && <ProductsSettings brandId={selectedBrandId} key={selectedBrandId} />}`.
  - Import `hasCity`, `queryExample` and `siteTypeOf` from `'../utils/siteType'`.

- [ ] **Step 6: Onboarding and template fetch.**
  - `queryTemplates.ts`:

    ```ts
    export async function fetchQueryTemplates(category: string, brandName?: string, businessType?: string, city?: string): Promise<SuggestedQuery[]> {
      const res = await api.get('/queries/templates', { params: { category, brand: brandName || '', businessType: businessType || '', city: city || '' } });
      return res.data?.data?.queries || [];
    }
    ```

  - Onboarding:
    - Add the state `const [city, setCity] = useState('');`.
    - After the Primary Market field, add the same City field block as in Settings, bound to `city`, shown when `hasCity(businessType)`.
    - In `loadTemplates`, call `fetchQueryTemplates(category, brandName.trim(), businessType, hasCity(businessType) ? city.trim() : '')`.
    - Change the effect deps `[category, brandName, maxQueries]` to `[category, brandName, maxQueries, businessType, city]`.
    - In the POST `/brands` body, add `city: hasCity(businessType) ? city.trim() : '',`.
    - Import `hasCity` from `'../utils/siteType'`.

- [ ] **Step 7: Build and lint**

Run (in `frontend/`): `npm run build` and then `npm run lint`.
Expected: build succeeds (tsc + vite). Lint reports no new errors in the touched files.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/utils/siteType.ts frontend/src/components/AppLayout.tsx frontend/src/pages/Overview.tsx frontend/src/pages/WebsiteAudit.tsx frontend/src/pages/Settings.tsx frontend/src/pages/Onboarding.tsx frontend/src/utils/queryTemplates.ts
git commit -m "feat(app): hide product features and add city for service websites"
```

---

### Task 7: Full suite, PR, staging check

**Files:**
- Modify: Test Sheet artifact `https://claude.ai/artifact/6kjFuSdUy3zM494orGHcT6` (collections features, cases, results)

- [ ] **Step 1: Full backend suite.** In `backend/`, run each check against local Mongo first. If one fails there, run it again with `DATABASE_URL=mongodb://127.0.0.1:1/none` (citations, fixImpact and freeCheck need that):

```bash
pass=0; fail=""; for f in src/checks/*.check.ts; do c=$(basename $f .check.ts); if SMTP_HOST= SMTP_USER= SMTP_PASS= NODE_ENV=development timeout 200 npx ts-node --transpile-only $f > /tmp/ck.log 2>&1 || SMTP_HOST= NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none timeout 200 npx ts-node --transpile-only $f > /tmp/ck.log 2>&1; then pass=$((pass+1)); else fail="$fail $c"; fi; done; echo "pass $pass; fail:$fail"
```

Expected: `pass 29; fail:` (25 existing + 4 new checks).

Also run `npx tsc --noEmit -p .` and `npx prettier --check src`. Expected: clean.

- [ ] **Step 2: PR.** Push `feat/service-websites` and open a PR against `main`. The PR body summarises S1–S6 and G4 from the spec, the Test plan, and no attribution lines. The user merges.

- [ ] **Step 3: Staging (after the merge deploys to staging).** Run with Playwright, logged in as qaagency.
  - **Sabka Dentist:** set businessType Service and city Mumbai in Settings, then Save. Then check:
    - The menu has no Products item, and Overview has no products card.
    - Website audit → Re-scan shows no Product pages panel, the warning says "main pages", and the section is "Listings & directories".
    - Recommendations → Re-scan has no "product" words, and shows "Google Business Profile … in Mumbai" and the LocalBusiness task.
    - The fix guide for local-listing shows "You can do this".
  - **Onboarding (new brand, Service, city Pune):** the query list starts "Best healthcare service in Pune", and the last query is "… reviews: kaisa hai, bharosa kar sakte hain?". Exit before creating it.
  - **Switch:** turn "I sell products on this website" on for Sabka Dentist. Products comes back in the menu and on Overview. Turn it off again.
  - **Hasan Oud (ecommerce):** the menu has Products, and the audit shows the Product pages panel and "product pages".
  - **390 px:** the Settings brand form with the City field has no sideways scroll.
- [ ] **Step 4: Test Sheet.** Add a feature "Service websites" and cases N23-01… covering each Step 3 bullet as positive, plus negatives: city `<script>` refused, and Hasan Oud unchanged. Record the results with the build sha.
