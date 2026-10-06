# Product-level Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show which of a brand's products the AI engines name: import products from Shopify, give each a short name, and count them in the saved scan answers on a Products page and an Overview card.

**Architecture:** Products live on the brand document (`brand.products`). Pure functions in `productService.ts` clean the Shopify list, build short names, match products in `mention.rawText` and aggregate the latest and previous scan (same pattern as `computeLostTo`). A thin controller exposes list/save/import/short-names/visibility; React gets a Settings section, a Products page and an Overview card.

**Tech Stack:** Express + Mongoose (TypeScript, ts-node), Joi, React 19 + Vite, existing `aiService.callAnyAvailableAi`, `util/publicUrl.ts`.

**Spec:** `docs/superpowers/specs/2026-10-06-product-visibility-design.md`

## Global Constraints

- No new dependencies.
- The backend has no test runner: checks are `assert` scripts under `backend/src/checks/`, run with `NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/<file>.ts` (the logger needs a DB URL; these checks use no DB). They must not call the network or real AI providers, and end with `process.exit(0)`.
- Local runs never send email: start the backend with `SMTP_HOST= SMTP_USER= SMTP_PASS=' '`.
- Every fetch of a store goes through `fetchPublicText` (`backend/src/util/publicUrl.ts`), never plain axios.
- `maxProducts`: free 3, starter 10, growth 25, agency 50.
- AI naming: cost purpose `'products'`, at most 10 calls per brand per 24 hours, failure never blocks saving.
- Scan cost must not change: nothing in this plan runs during a scan.
- Commits under the user's name only, no Claude/AI trailers. Conventional lowercase messages (`feat(products): ...`).
- PR #26 (indian buyer queries) also adds a cost purpose (`'queries'`) and edits `brandController.ts`. If it is merged first, rebase and keep both purposes.

## Review Focus

- A one-word, common short name ("Oud", "Rose") would match every answer → not matched, row shows "make the name more specific" (Task 2 check).
- Another brand's product with the same name ("Silk Oud" by a competitor) in an answer that never names the brand → not counted (Task 2 check).
- A store with 0 products, a non-Shopify site, or HTML instead of JSON at `/products.json` → `shopify: false`, no crash (Task 3 check).
- Saving more products than the plan allows, or after a downgrade → 403 on save; after a downgrade extra products show `overLimit` and are not counted (Task 2 check + Task 3 controller).
- A refresh from Shopify must not overwrite a name the user edited (`nameEditedByUser`) (Task 1 check on `mergeRefresh`).

---

### Task 1: Short names and the product list (pure)

**Files:**
- Modify: `backend/src/types/brandTypes.ts` (add `IBrandProduct`, `products?` on `IBrand`, `IUpdateBrandRequestBody`)
- Modify: `backend/src/config/planLimits.ts` (add `maxProducts` to each plan)
- Create: `backend/src/service/productService.ts`
- Create: `backend/src/checks/products.check.ts`

**Interfaces:**
- Produces:
  - `interface IBrandProduct { shopifyId: string | null; title: string; shortName: string; aliases: string[]; url: string; price: number | null; image: string; productType: string; nameEditedByUser: boolean }` (in `brandTypes.ts`)
  - `interface IProductCandidate extends IBrandProduct { hidden: boolean; hiddenReason: '' | 'free' | 'sample' | 'gift' | 'duplicate' }`
  - `ruleShortName(title: string, brandName: string): string`
  - `cleanProductList(raw: unknown[], brandName: string, origin: string): IProductCandidate[]`
  - `validateAiShortName(name: unknown, title: string, brandName: string): string | null`
  - `mergeRefresh(saved: IBrandProduct[], fresh: IProductCandidate[]): IBrandProduct[]`

- [ ] **Step 1: Write the failing check** `backend/src/checks/products.check.ts`:

```ts
/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/products.check.ts
import assert from 'assert'
import { ruleShortName, cleanProductList, validateAiShortName, mergeRefresh } from '../service/productService'
import { PLAN_LIMITS } from '../config/planLimits'

const run = async () => {
    // Plan limits
    assert.deepStrictEqual(
        [PLAN_LIMITS.free.maxProducts, PLAN_LIMITS.starter.maxProducts, PLAN_LIMITS.growth.maxProducts, PLAN_LIMITS.agency.maxProducts],
        [3, 10, 25, 50]
    )

    // Rule names on real Hasan Oud titles
    const B = 'Hasan Oud'
    assert.equal(ruleShortName('Silk oud Special Powerful Sweet Arabic Attar Sample 1 ml', B), 'Silk Oud')
    assert.equal(ruleShortName('Passion Oud Strong FruIty Oud Attar by Hasanoud', B), 'Passion Oud')
    assert.equal(ruleShortName('VIBE Long Lasting Fresh Aromatic Perfume By Hasan Oud', B), 'Vibe')
    assert.equal(ruleShortName('Amber Rose Premium fragrances By Hasan Oud Alcohol Free Attar', B), 'Amber Rose')
    assert.equal(ruleShortName('The Blue Premium fragrances By Hasan Oud Alcohol Free Attar', B), 'Blue')
    assert.equal(ruleShortName('Oud Sample Attar Set by HASANOUD', B), 'Oud')
    assert.equal(ruleShortName('Alpha Signature Scent By Hasan Oud', B), 'Alpha Signature')
    assert.equal(ruleShortName('🎁 Hasan Oud Classic Vegan Leather Bag - Deep Olive', B), 'Classic Vegan Leather')

    // Junk is hidden; a sample and the full-size product share a name, only the full size stays visible
    const p = (id: number, title: string, price: string, handle = 'h' + id) => ({
        id,
        title,
        handle,
        product_type: '',
        variants: [{ price }],
        images: [{ src: `https://cdn/x${id}.jpg` }]
    })
    const list = cleanProductList(
        [
            p(1, 'Silk oud Special Powerful Sweet Arabic Attar Sample 1 ml', '199.00'),
            p(2, 'Silk Oud Premium Fragrances By Hasan Oud Alcohol Free Attar', '599.00', 'silk-oud'),
            p(3, '🎁 Hasan Oud Classic Vegan Leather Bag - Maroon', '0.00'),
            p(4, 'Unforgettable Gift Packaging', '599.00'),
            p(5, 'Silk Oud Attar by Hasanoud', '399.00'),
            p(6, 'Passion Oud Strong FruIty Oud Attar by Hasanoud', '599.00')
        ],
        B,
        'https://hasanoud.com'
    )
    const visible = list.filter((c) => !c.hidden)
    assert.deepStrictEqual(
        visible.map((c) => [c.shortName, c.price]),
        [
            ['Silk Oud', 599],
            ['Passion Oud', 599]
        ]
    )
    assert.deepStrictEqual(
        list.filter((c) => c.hidden).map((c) => c.hiddenReason).sort(),
        ['duplicate', 'free', 'gift', 'sample']
    )
    const silk = visible[0]
    assert.equal(silk.url, 'https://hasanoud.com/products/silk-oud')
    assert.equal(silk.shopifyId, '2')
    assert.equal(silk.image, 'https://cdn/x2.jpg')
    assert.deepStrictEqual(cleanProductList('nope' as never, B, 'https://x.com'), [])

    // AI names: kept only when short, made of title words and free of the brand
    const T = 'Passion Oud Strong FruIty Oud Attar by Hasanoud'
    assert.equal(validateAiShortName('Passion Oud', T, B), 'Passion Oud')
    assert.equal(validateAiShortName(' "Passion Oud" ', T, B), 'Passion Oud')
    assert.equal(validateAiShortName('Passion Musk', T, B), null) // word not in the title
    assert.equal(validateAiShortName('Hasanoud Passion', T, B), null) // brand
    assert.equal(validateAiShortName('Passion Oud Strong Fruity Oud', T, B), null) // 5 words
    assert.equal(validateAiShortName(42, T, B), null)

    // Refresh keeps a name the user edited, updates price/url/image/title
    const saved = [
        { ...silk, shortName: 'Silk Oud Attar', nameEditedByUser: true, price: 499 },
        { ...visible[1], price: 500 },
        { shopifyId: null, title: 'Manual', shortName: 'Manual', aliases: [], url: '', price: null, image: '', productType: '', nameEditedByUser: true }
    ]
    const merged = mergeRefresh(saved, list)
    assert.deepStrictEqual(
        merged.map((m) => [m.shortName, m.price]),
        [
            ['Silk Oud Attar', 599],
            ['Passion Oud', 599],
            ['Manual', null]
        ]
    )

    console.log('products checks: PASS')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
```

- [ ] **Step 2: Run it and see it fail:** `cd backend && NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/products.check.ts` → "Cannot find module '../service/productService'".

- [ ] **Step 3: Types and limits.** In `brandTypes.ts` add:

```ts
export interface IBrandProduct {
    shopifyId: string | null
    title: string
    shortName: string
    aliases: string[]
    url: string
    price: number | null
    image: string
    productType: string
    nameEditedByUser: boolean
}
```
and `products?: IBrandProduct[]` to `IBrand` and `IUpdateBrandRequestBody`. In `planLimits.ts` add `maxProducts: 3` (free), `10` (starter), `25` (growth), `50` (agency) next to `maxCompetitors`.

- [ ] **Step 4: Implement** `backend/src/service/productService.ts`:

```ts
// Products of a brand: the Shopify list, short names, and how often AI answers name each product.
// Everything here except fetchShopifyProducts and aiShortNames is pure, for the check script.
import { IBrandProduct } from '../types/brandTypes'
import { brandKey } from './competitorService'

export interface IProductCandidate extends IBrandProduct {
    hidden: boolean
    hiddenReason: '' | 'free' | 'sample' | 'gift' | 'duplicate'
}

// Words that describe a product rather than name it; the name is what comes before the first of these
const FILLER = new Set(
    (
        'premium fragrance fragrances alcohol free long lasting attar attars ittar perfume perfumes parfum eau de edp edt spray ' +
        'sample samples tester testers special powerful strong sweet fresh aromatic arabic luxury original unisex scent ' +
        'set combo pack gift for men women him her with and by from'
    ).split(' ')
)
const titleCase = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
const words = (s: string) => s.split(/\s+/).filter(Boolean)

// "Hasan Oud", "Hasanoud", "HASANOUD", "Hasan-Oud"
const brandPattern = (brandName: string) =>
    new RegExp(
        words(brandName)
            .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('[\\s-]*'),
        'giu'
    )

export const ruleShortName = (title: string, brandName: string): string => {
    const cleaned = title
        .replace(brandPattern(brandName), ' ')
        .replace(/\b\d+(\.\d+)?\s?(ml|g|gm|kg|l)\b/gi, ' ')
        .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
        .replace(/\s-\s.*$/, ' ') // "Bag - Deep Olive": the part after a spaced dash is a variant
    const all = words(cleaned)
    const firstFiller = all.findIndex((w) => FILLER.has(w.toLowerCase()))
    let name = firstFiller === -1 ? all : all.slice(0, firstFiller)
    if (name[0]?.toLowerCase() === 'the') name = name.slice(1)
    if (!name.length) name = all.filter((w) => !FILLER.has(w.toLowerCase()))
    return name.slice(0, 3).map(titleCase).join(' ')
}

const isSample = (title: string) => /\b(sample|tester)s?\b/i.test(title) || /\b[1-5]\s?ml\b/i.test(title)
const isGift = (title: string) => /gift\s*(card|packaging|wrap|box)/i.test(title)

interface IShopifyProduct {
    id?: number | string
    title?: string
    handle?: string
    product_type?: string
    variants?: Array<{ price?: string }>
    images?: Array<{ src?: string }>
}

export const cleanProductList = (raw: unknown[], brandName: string, origin: string): IProductCandidate[] => {
    if (!Array.isArray(raw)) return []
    const out: IProductCandidate[] = []
    for (const item of raw as IShopifyProduct[]) {
        if (!item || typeof item.title !== 'string' || !item.handle) continue
        const prices = (item.variants || []).map((v) => parseFloat(v.price || '')).filter((n) => !isNaN(n))
        const price = prices.length ? Math.min(...prices) : null
        const hiddenReason: IProductCandidate['hiddenReason'] = isGift(item.title)
            ? 'gift'
            : isSample(item.title)
              ? 'sample'
              : !price
                ? 'free'
                : ''
        out.push({
            shopifyId: item.id !== undefined ? String(item.id) : null,
            title: item.title.trim(),
            shortName: ruleShortName(item.title, brandName),
            aliases: [],
            url: `${origin}/products/${item.handle}`,
            price,
            image: item.images?.[0]?.src || '',
            productType: (item.product_type || '').trim(),
            nameEditedByUser: false,
            hidden: hiddenReason !== '',
            hiddenReason
        })
    }
    // Same short name twice among visible products: keep the dearest (the full size)
    const best = new Map<string, IProductCandidate>()
    for (const c of out.filter((c) => !c.hidden)) {
        const key = brandKey(c.shortName)
        const kept = best.get(key)
        if (!kept || (c.price ?? 0) > (kept.price ?? 0)) best.set(key, c)
    }
    for (const c of out) {
        if (!c.hidden && best.get(brandKey(c.shortName)) !== c) {
            c.hidden = true
            c.hiddenReason = 'duplicate'
        }
    }
    return out
}

export const validateAiShortName = (name: unknown, title: string, brandName: string): string | null => {
    if (typeof name !== 'string') return null
    const clean = name.replace(/["'`*]/g, '').replace(/\s+/g, ' ').trim()
    const ws = words(clean)
    if (ws.length < 1 || ws.length > 4) return null
    const titleWords = new Set(words(title.replace(/[^\p{L}\p{N}\s]/gu, ' ')).map(brandKey))
    if (!ws.every((w) => titleWords.has(brandKey(w)))) return null
    const own = brandKey(brandName)
    if (own && (brandKey(clean).includes(own) || ws.some((w) => own.includes(brandKey(w)) && brandKey(w).length > 3 && own.startsWith(brandKey(w)))))
        return null
    return clean
}

// Shopify refresh: store facts update, names the user chose stay
export const mergeRefresh = (saved: IBrandProduct[], fresh: IProductCandidate[]): IBrandProduct[] => {
    const byId = new Map(fresh.filter((f) => f.shopifyId).map((f) => [f.shopifyId as string, f]))
    return saved.map((s) => {
        const f = s.shopifyId ? byId.get(s.shopifyId) : undefined
        if (!f) return s
        return {
            ...s,
            title: f.title,
            url: f.url,
            price: f.price,
            image: f.image,
            productType: f.productType,
            shortName: s.nameEditedByUser ? s.shortName : s.shortName || f.shortName
        }
    })
}
```

Note on `validateAiShortName`'s brand test: "Hasanoud Passion" must be refused (contains the brand key), while "Passion Oud" must pass even though "oud" is inside "hasanoud". The rule refuses a word only when the brand key *starts with* it and it is longer than 3 letters ("hasan" → refused, "oud" → allowed). Keep that comment in the code.

- [ ] **Step 5: Run the check** → `products checks: PASS`. Then `npx tsc --noEmit -p .` and `npx eslint src/service/productService.ts src/checks/products.check.ts src/config/planLimits.ts src/types/brandTypes.ts` are clean. If a rule-name assertion fails, adjust `FILLER` or the regexes, not the expected names (they are the spec's examples).

- [ ] **Step 6: Commit** `feat(products): short names and cleaned shopify product list`

---

### Task 2: Matching and visibility (pure)

**Files:**
- Modify: `backend/src/service/productService.ts`
- Modify: `backend/src/checks/products.check.ts`

**Interfaces:**
- Consumes: `IBrandProduct`; `nameMatcher`, `positionIn`, `brandKey` from `competitorService.ts`; `IMention` from `types/mentionTypes.ts`.
- Produces:
  - `isGenericName(shortName: string): boolean`
  - `interface IProductHit { queryText: string; model: string; position: number | null; line: string }`
  - `interface IProductRow { shortName: string; title: string; url: string; price: number | null; image: string; answers: number; previousAnswers: number | null; bestPosition: number | null; models: string[]; hits: IProductHit[]; genericName: boolean; overLimit: boolean }`
  - `interface IProductVisibility { totalAnswers: number; textAvailable: boolean; counted: number; notSeen: number; products: IProductRow[] }`
  - `computeProductVisibility(mentions: IMention[], previous: IMention[], brandName: string, products: IBrandProduct[], maxProducts: number): IProductVisibility`
  - `suggestProductQuestions(product: IBrandProduct, existing: string[]): Array<{ text: string; lang: 'HI-EN' | 'EN'; intent: 'Price' }>`

- [ ] **Step 1: Add the failing assertions** to `products.check.ts`, before the final `console.log` (add `computeProductVisibility, isGenericName, suggestProductQuestions` to the import):

```ts
    // Matching and counting
    const prod = (shortName: string, extra: Partial<Record<string, unknown>> = {}) => ({
        shopifyId: null,
        title: shortName,
        shortName,
        aliases: [],
        url: '',
        price: 599,
        image: '',
        productType: '',
        nameEditedByUser: false,
        ...extra
    })
    const m = (queryText: string, model: string, rawText: string) =>
        ({ queryText, model, rawText, mentioned: /hasan\s*oud/i.test(rawText), position: null }) as never
    const current = [
        m('q1', 'ChatGPT', 'Top picks:\n**1. Hasan Oud Silk Oud** - sweet\n2. Ajmal Amber Wood'),
        m('q1', 'Gemini', 'Try Silk Oud by Hasan Oud or Passion Oud.'),
        m('q2', 'ChatGPT', '1. Swiss Arabian Silk Oud\n2. Ajmal'), // no Hasan Oud: someone else's Silk Oud
        m('q2', 'Claude', 'Hasan Oud makes good oud attars.'), // "Oud" alone must not match anything
        m('q3', 'ChatGPT', '')
    ]
    const previous = [m('q1', 'ChatGPT', 'Hasan Oud Silk Oud is nice')]
    const products = [prod('Silk Oud'), prod('Passion Oud'), prod('Oud'), prod('Black Oud'), prod('Vibe')]
    const v = computeProductVisibility(current, previous, 'Hasan Oud', products, 4)
    assert.equal(v.totalAnswers, 5)
    assert.equal(v.textAvailable, true)
    assert.equal(v.counted, 4)
    const row = (n: string) => v.products.find((r) => r.shortName === n)!
    assert.equal(row('Silk Oud').answers, 2)
    assert.equal(row('Silk Oud').bestPosition, 1)
    assert.deepStrictEqual(row('Silk Oud').models, ['ChatGPT', 'Gemini'])
    assert.equal(row('Silk Oud').previousAnswers, 1)
    assert.equal(row('Silk Oud').hits[0].line, '1. Hasan Oud Silk Oud - sweet')
    assert.equal(row('Passion Oud').answers, 1)
    assert.equal(row('Oud').genericName, true)
    assert.equal(row('Oud').answers, 0)
    assert.equal(row('Black Oud').answers, 0)
    assert.equal(row('Vibe').overLimit, true)
    assert.equal(row('Vibe').answers, 0)
    assert.equal(v.notSeen, 2) // Oud and Black Oud; Vibe is over the limit, not "not seen"
    assert.deepStrictEqual(
        v.products.map((r) => r.shortName),
        ['Silk Oud', 'Passion Oud', 'Oud', 'Black Oud', 'Vibe']
    )
    // Aliases count too
    assert.equal(computeProductVisibility(current, [], 'Hasan Oud', [prod('Passion', { aliases: ['Passion Oud'] })], 3).products[0].answers, 1)
    // No previous scan → previousAnswers null; no answer text at all → textAvailable false
    assert.equal(computeProductVisibility(current, [], 'Hasan Oud', products, 4).products[0].previousAnswers, null)
    assert.equal(computeProductVisibility([m('q', 'ChatGPT', '')], [], 'Hasan Oud', products, 4).textAvailable, false)
    assert.equal(computeProductVisibility([], [], 'Hasan Oud', [], 3).products.length, 0)
    assert.equal(isGenericName('Rose'), true)
    assert.equal(isGenericName('Silk Oud'), false)

    // Product questions from type and price
    const qs = suggestProductQuestions(prod('Silk Oud', { title: 'Silk Oud Premium Fragrances Alcohol Free Attar', price: 599 }) as never, [
        'Best attar under ₹600 in India'
    ])
    assert.deepStrictEqual(
        qs.map((q) => q.text),
        ['600 ke andar sabse accha attar']
    )
    assert.deepStrictEqual(suggestProductQuestions(prod('Bag', { title: 'Leather Bag', price: null }) as never, []), [])
```

- [ ] **Step 2: Run it and see it fail** (`computeProductVisibility is not a function`).

- [ ] **Step 3: Implement**, appended to `productService.ts` (add `import { nameMatcher, positionIn } from './competitorService'` and `import { IMention } from '../types/mentionTypes'`):

```ts
// One-word names that would match every fragrance or fashion answer
const GENERIC = new Set(
    'oud rose amber musk classic gold black white blue silver royal premium original fresh noir red green pink night'.split(' ')
)
export const isGenericName = (shortName: string) => words(shortName).length === 1 && GENERIC.has(shortName.trim().toLowerCase())

export interface IProductHit {
    queryText: string
    model: string
    position: number | null
    line: string
}
export interface IProductRow {
    shortName: string
    title: string
    url: string
    price: number | null
    image: string
    answers: number
    previousAnswers: number | null
    bestPosition: number | null
    models: string[]
    hits: IProductHit[]
    genericName: boolean
    overLimit: boolean
}
export interface IProductVisibility {
    totalAnswers: number
    textAvailable: boolean
    counted: number
    notSeen: number
    products: IProductRow[]
}

const lineOf = (text: string, re: RegExp) =>
    (text.split('\n').find((l) => re.test(l)) || '')
        .replace(/[*_#>`]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200)

// Answers that name this product; only answers that also name the brand, so another brand's
// product with the same name is not counted
const hitsFor = (mentions: IMention[], brandName: string, p: IBrandProduct): IProductHit[] => {
    const own = brandKey(brandName)
    const matchers = [p.shortName, ...(p.aliases || [])].filter(Boolean).map(nameMatcher)
    const hits: IProductHit[] = []
    for (const m of mentions) {
        const text = m.rawText || ''
        if (!text || !brandKey(text).includes(own)) continue
        const re = matchers.find((r) => r.test(text))
        if (!re) continue
        hits.push({ queryText: m.queryText, model: m.model, position: positionIn(text, re), line: lineOf(text, re) })
    }
    return hits
}

export const computeProductVisibility = (
    mentions: IMention[],
    previous: IMention[],
    brandName: string,
    products: IBrandProduct[],
    maxProducts: number
): IProductVisibility => {
    const prevWithText = previous.filter((m) => m.rawText)
    const rows: IProductRow[] = products.map((p, i) => {
        const overLimit = i >= maxProducts
        const genericName = isGenericName(p.shortName)
        const hits = overLimit || genericName ? [] : hitsFor(mentions, brandName, p)
        const positions = hits.map((h) => h.position).filter((x): x is number => x !== null)
        return {
            shortName: p.shortName,
            title: p.title,
            url: p.url,
            price: p.price,
            image: p.image,
            answers: hits.length,
            previousAnswers: overLimit || genericName || !prevWithText.length ? null : hitsFor(prevWithText, brandName, p).length,
            bestPosition: positions.length ? Math.min(...positions) : null,
            models: [...new Set(hits.map((h) => h.model))],
            hits,
            genericName,
            overLimit
        }
    })
    // Named first (most answers, then best position), then not seen, then over the plan limit
    const rank = (r: IProductRow) => (r.overLimit ? 2 : r.answers ? 0 : 1)
    rows.sort((a, b) => rank(a) - rank(b) || b.answers - a.answers || (a.bestPosition ?? 99) - (b.bestPosition ?? 99))
    return {
        totalAnswers: mentions.length,
        textAvailable: mentions.some((m) => m.rawText),
        counted: Math.min(products.length, maxProducts),
        notSeen: rows.filter((r) => !r.overLimit && !r.answers).length,
        products: rows
    }
}

// "600 ke andar sabse accha attar": the product's kind and the buyer's budget, no AI
const KINDS: Array<[string, RegExp]> = [
    ['attar', /\b(attar|ittar|itr)\b/i],
    ['perfume', /\b(perfume|parfum|edp|edt|spray|scent)\b/i],
    ['deodorant', /\bdeo(dorant)?\b/i]
]
const budgetFor = (price: number) => {
    const step = price < 1000 ? 100 : price < 5000 ? 500 : 1000
    return Math.ceil(price / step) * step
}
const questionKey = (s: string) =>
    s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()

export const suggestProductQuestions = (product: IBrandProduct, existing: string[]) => {
    const kind = KINDS.find(([, re]) => re.test(product.title))?.[0] || product.productType.trim().toLowerCase()
    if (!kind || !product.price) return []
    const budget = budgetFor(product.price)
    const seen = new Set(existing.map(questionKey))
    return [
        { text: `${budget} ke andar sabse accha ${kind}`, lang: 'HI-EN' as const, intent: 'Price' as const },
        { text: `Best ${kind} under ₹${budget} in India`, lang: 'EN' as const, intent: 'Price' as const }
    ].filter((q) => !seen.has(questionKey(q.text)))
}
```

- [ ] **Step 4: Run the check** → PASS; `tsc --noEmit` and eslint clean.

- [ ] **Step 5: Commit** `feat(products): count products in ai answers`

---

### Task 3: Shopify fetch, AI names, model and API

**Files:**
- Modify: `backend/src/service/productService.ts` (`fetchShopifyProducts`, `aiShortNames`)
- Modify: `backend/src/model/brandModel.ts` (`products` sub-schema)
- Modify: `backend/src/model/costLogModel.ts`, `backend/src/service/costLogService.ts` (purpose `'products'`)
- Modify: `backend/src/service/validationService.ts` (`validationSaveProductsBody`, `validationShortNamesBody`)
- Create: `backend/src/controller/productController.ts`
- Modify: `backend/src/router/apiRouter.ts`
- Modify: `backend/src/service/aiViewService.ts`, `backend/src/controller/auditController.ts` (optional product URL)
- Modify: `backend/src/checks/products.check.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–2; `fetchPublicText` from `util/publicUrl.ts`; `auditService.cleanUrl`; `aiService.callAnyAvailableAi`; `withAiCallContext`; `loadScanPair`; `getPlanLimits`; `ensureUserOrg`, `databseService.findBrandByIdAndOrgId` (same use as `brandController.updateBrand`).
- Produces (HTTP, all behind `authentication`):
  - `GET /brands/:id/products` → `{ products: IBrandProduct[], maxProducts: number }`
  - `PUT /brands/:id/products` body `{ products: IBrandProduct[] }` → `{ products }`; 403 over the limit
  - `POST /brands/:id/products/import` body `{}` → `{ shopify: boolean, products: IProductCandidate[], hidden: number, truncated: boolean }`
  - `POST /brands/:id/products/short-names` body `{ titles: string[] }` (max 50) → `{ names: Array<string | null> }`; 429 over the cap
  - `POST /brands/:id/products/refresh` body `{}` → `{ products: IBrandProduct[] }` (saves `mergeRefresh` result)
  - `GET /brands/:id/products/visibility` → `IProductVisibility & { suggestions: Record<string, Array<{ text; lang; intent }>> }` keyed by short name, only for not-seen rows
  - `POST /brands/:id/audit/ai-view` body `{ url?: string }`: a product URL on the brand's own host
- Functions:
  - `fetchShopifyProducts(website: string, fetchText?: (url: string) => Promise<string>): Promise<{ shopify: boolean; raw: unknown[]; truncated: boolean }>`
  - `aiShortNames(titles: string[], brandName: string): Promise<Array<string | null>>`

- [ ] **Step 1: Add the failing assertions** to `products.check.ts` (import `fetchShopifyProducts`, `aiShortNames`, and `aiService` from `'../service/aiService'`):

```ts
    // Shopify fetch with a stubbed fetcher: pages until a short page, max 4 pages
    const page = (n: number, count: number) =>
        JSON.stringify({ products: [...Array(count)].map((_, i) => ({ id: n * 1000 + i, title: `P ${n}-${i}`, handle: `p-${n}-${i}`, variants: [{ price: '100' }] })) })
    const asked: string[] = []
    const two = await fetchShopifyProducts('hasanoud.com', async (u) => {
        asked.push(u)
        return u.includes('page=1') ? page(1, 250) : page(2, 3)
    })
    assert.equal(two.shopify, true)
    assert.equal(two.raw.length, 253)
    assert.equal(two.truncated, false)
    assert.ok(asked[0].startsWith('https://hasanoud.com/products.json?limit=250&page=1'))
    const many = await fetchShopifyProducts('https://big.example', async (u) => page(Number(/page=(\d)/.exec(u)![1]), 250))
    assert.equal(many.raw.length, 1000)
    assert.equal(many.truncated, true)
    for (const body of ['<html>store</html>', '{"products": "x"}', '{}']) {
        assert.equal((await fetchShopifyProducts('https://x.example', async () => body)).shopify, false)
    }
    assert.equal(
        (
            await fetchShopifyProducts('https://x.example', async () => {
                throw new Error('404')
            })
        ).shopify,
        false
    )
    assert.equal((await fetchShopifyProducts('https://x.example', async () => '{"products": []}')).shopify, true)

    // AI names: one call, each answer validated, a broken reply keeps nothing
    const stub = aiService as unknown as { callAnyAvailableAi: (p: string, n?: number) => Promise<string | null> }
    stub.callAnyAvailableAi = async () => 'Here: {"0": "Passion Oud", "1": "Hasanoud Blue", "2": "Crystal Air"}'
    assert.deepStrictEqual(
        await aiShortNames(
            ['Passion Oud Strong FruIty Oud Attar by Hasanoud', 'The Blue Premium fragrances By Hasan Oud', 'Crystal air Powdery Amber Attar by Hasanoud'],
            'Hasan Oud'
        ),
        ['Passion Oud', null, 'Crystal Air']
    )
    stub.callAnyAvailableAi = async () => null
    assert.deepStrictEqual(await aiShortNames(['A b'], 'X'), [null])
```

- [ ] **Step 2: Run it and see it fail.**

- [ ] **Step 3: Implement the two service functions** in `productService.ts` (imports: `aiService from './aiService'`, `{ auditService } from './auditService'`, `{ fetchPublicText } from '../util/publicUrl'`):

```ts
const PAGE = 250
const MAX_PAGES = 4

export const fetchShopifyProducts = async (
    website: string,
    fetchText: (url: string) => Promise<string> = (url) => fetchPublicText(url, { Accept: 'application/json' })
): Promise<{ shopify: boolean; raw: unknown[]; truncated: boolean }> => {
    const origin = new URL(auditService.cleanUrl(website)).origin
    const raw: unknown[] = []
    for (let n = 1; n <= MAX_PAGES; n++) {
        let products: unknown
        try {
            products = (JSON.parse(await fetchText(`${origin}/products.json?limit=${PAGE}&page=${n}`)) as { products?: unknown }).products
        } catch {
            products = undefined
        }
        if (!Array.isArray(products)) return n === 1 ? { shopify: false, raw: [], truncated: false } : { shopify: true, raw, truncated: false }
        raw.push(...products)
        if (products.length < PAGE) return { shopify: true, raw, truncated: false }
    }
    return { shopify: true, raw, truncated: true }
}

const namesPrompt = (titles: string[]) => `Shorten each store product title to the name a shopper would say, 1 to 3 words, using only words from the title.
Drop the brand name, sizes and describing words ("Premium", "Alcohol Free", "Long Lasting", "Attar", "Perfume").
Reply with JSON only: {"0": "Name", "1": "Name", ...}.

${titles.map((t, i) => `${i}: ${t}`).join('\n')}`

export const aiShortNames = async (titles: string[], brandName: string): Promise<Array<string | null>> => {
    const reply = await aiService.callAnyAvailableAi(namesPrompt(titles), 800)
    let parsed: Record<string, unknown> = {}
    try {
        const match = reply?.match(/\{[\s\S]*\}/)
        parsed = match ? JSON.parse(match[0]) : {}
    } catch {
        parsed = {}
    }
    return titles.map((t, i) => validateAiShortName(parsed[String(i)], t, brandName))
}
```

Check that `auditService.cleanUrl('hasanoud.com')` returns `https://hasanoud.com` (it adds the scheme); if it returns a different shape, prefix `https://` when the input has no scheme before `new URL`.

- [ ] **Step 4: Model, cost purpose, validation.**
  - `brandModel.ts`: a `productSchema` (`{ _id: false }`) with `shopifyId: { type: String, default: null }`, `title: { type: String, required: true, trim: true }`, `shortName: { type: String, required: true, trim: true }`, `aliases: { type: [String], default: [] }`, `url`, `image`, `productType` (`String`, default `''`), `price: { type: Number, default: null }`, `nameEditedByUser: { type: Boolean, default: false }`; on the brand: `products: { type: [productSchema], default: [] }`.
  - `costLogModel.ts` enum and `costLogService.ts` `purpose` union gain `'products'`.
  - `validationService.ts`:

```ts
const productJoiSchema = Joi.object({
    shopifyId: Joi.string().allow(null).optional(),
    title: Joi.string().trim().max(300).required(),
    shortName: Joi.string().trim().min(2).max(60).required(),
    aliases: Joi.array().items(Joi.string().trim().min(2).max(60)).max(3).optional().default([]),
    url: Joi.string().uri().allow('').optional().default(''),
    price: Joi.number().min(0).allow(null).optional().default(null),
    image: Joi.string().allow('').optional().default(''),
    productType: Joi.string().allow('').optional().default(''),
    nameEditedByUser: Joi.boolean().optional().default(false)
})
export const validationSaveProductsBody = Joi.object({ products: Joi.array().items(productJoiSchema).max(200).required() })
export const validationShortNamesBody = Joi.object({ titles: Joi.array().items(Joi.string().trim().max(300)).min(1).max(50).required() })
```

- [ ] **Step 5: Controller** `backend/src/controller/productController.ts`. Every handler starts like `brandController.updateBrand`: `ensureUserOrg` → `findBrandByIdAndOrgId(id, orgId)` → 404 "Brand not found"; plan = `authenticatedUser.role === EUserRole.ADMIN ? 'agency' : (org.plan || 'free')`, `limits = getPlanLimits(plan)`; errors through `httpError(next, error, req, 500)`.

```ts
// list
getProducts: → httpResponse(..., { products: brand.products || [], maxProducts: limits.maxProducts })

// save
saveProducts:
    const { error, value } = validateJoiSchema(validationSaveProductsBody, req.body); if (error) → 422
    if (value.products.length > limits.maxProducts) → 403 `Your ${plan} plan allows maximum ${limits.maxProducts} products. You tried to save ${value.products.length}. Please upgrade your plan or remove products.`
    await brandModel.updateOne({ _id: brand._id }, { $set: { products: value.products } })
    → { products: value.products }

// import (saves nothing)
importProducts:
    const { shopify, raw, truncated } = await fetchShopifyProducts(brand.website)
    const origin = new URL(auditService.cleanUrl(brand.website)).origin
    const products = shopify ? cleanProductList(raw, brand.name, origin) : []
    → { shopify, products, hidden: products.filter((p) => p.hidden).length, truncated }

// AI names, 10 a day per brand
shortNames:
    validate validationShortNamesBody → 422
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const used = await costLogModel.countDocuments({ brandId: brand._id, purpose: 'products', createdAt: { $gte: since } })
    if (used >= 10) → 429 'Product names can be cleaned with AI 10 times a day. Edit the names by hand or try again tomorrow.'
    const names = await withAiCallContext({ brandId: String(brand._id), purpose: 'products' }, () => aiShortNames(value.titles, brand.name))
    → { names }

// refresh from Shopify
refreshProducts:
    const { shopify, raw } = await fetchShopifyProducts(brand.website)
    if (!shopify) → 422 'Shopify store not found. Add products manually.'
    const merged = mergeRefresh(brand.products || [], cleanProductList(raw, brand.name, origin))
    await brandModel.updateOne({ _id: brand._id }, { $set: { products: merged } })
    → { products: merged }

// visibility
getVisibility:
    const { current, previous } = await loadScanPair(id, brand.lastScanId)
    const result = computeProductVisibility(current, previous, brand.name, brand.products || [], limits.maxProducts)
    const existing = (brand.queries || []).map((q) => q.text)
    const suggestions = Object.fromEntries(
        (brand.products || [])
            .filter((p) => result.products.some((r) => r.shortName === p.shortName && !r.answers && !r.overLimit && !r.genericName))
            .map((p) => [p.shortName, suggestProductQuestions(p, existing)])
    )
    → { ...result, suggestions }
```

Routes in `apiRouter.ts` next to `/brands/:id/lost-to`:

```ts
router.route('/brands/:id/products').get(authentication, productController.getProducts).put(authentication, productController.saveProducts)
router.route('/brands/:id/products/import').post(authentication, productController.importProducts)
router.route('/brands/:id/products/short-names').post(authentication, productController.shortNames)
router.route('/brands/:id/products/refresh').post(authentication, productController.refreshProducts)
router.route('/brands/:id/products/visibility').get(authentication, productController.getVisibility)
```

- [ ] **Step 6: AI view for one product URL.** `runAiView(website: string, productUrl?: string)`: when `productUrl` is given, it is the "Product page" target instead of the first product link found on the homepage. In `auditController.runAiView`, read `req.body?.url`; if present it must parse as a URL whose `hostname` equals the hostname of `auditService.cleanUrl(brand.website)` (ignore a leading `www.` on both), else 422 "Use a page from your own website". With a `url`, skip the 5-minute cache read and do not save the result to the audit (it is a one-off check); without it, behaviour is unchanged.

- [ ] **Step 7: Verify.** The check passes; `tsc --noEmit`, eslint on changed files, and the existing checks still pass: `aiView.check.ts`, `publicUrl.check.ts`, `lostToNames.check.ts`. Then one manual local call (backend started with blank SMTP vars, a throwaway local user and a brand on `https://hasanoud.com`): `POST /brands/:id/products/import` returns `shopify: true`, about 200 products, with "Silk Oud" and "Passion Oud" visible and samples hidden. Delete the throwaway user and brand afterwards.

- [ ] **Step 8: Commit** `feat(products): shopify import, ai names and products api`

---

### Task 4: Settings → Products

**Files:**
- Create: `frontend/src/components/ProductsSettings.tsx`
- Modify: `frontend/src/pages/Settings.tsx` (render the section)
- Modify: `frontend/src/hooks/usePlanLimits.ts` (`maxProducts` in the `PlanLimits` type)
- Modify: `frontend/src/index.css` (only if a class is missing; reuse `card`, `btn`, `btn-ghost`, `tag`, `sub`)

**Interfaces:**
- Consumes: the Task 3 endpoints.
- Produces: `export default function ProductsSettings({ brandId, brandName }: { brandId?: string; brandName?: string })`.

- [ ] **Step 1: Component.** States: `saved: Product[]`, `maxProducts`, `mode: 'list' | 'pick' | 'review'`, `candidates`, `showHidden`, `query`, `picked: Set<string>` (by `url`), `review: Product[]`, `error`, `busy`.
  - **List mode:** a card titled "Products" with the line "AI answers are searched for these names." Each saved product: image (36px), short name (bold), title (small, muted), price (`₹599`), aliases as tags, "Edit" (inline inputs for short name and aliases, sets `nameEditedByUser: true`) and "Remove". Buttons: "Import from Shopify", "Refresh from Shopify" (only if any product has `shopifyId`), "Add manually" (inline form: short name required, link and price optional). Every change saves with `PUT /brands/:id/products`; on a 403 show the server message in red and keep the previous list.
  - **Import:** `POST .../products/import`. If `shopify` is false: show "Shopify store not found. Add products manually." and open the manual form. Else switch to pick mode.
  - **Pick mode:** a search box filtering by title; rows with checkbox, image, title, price and the rule short name; already saved products (same `shopifyId`) are pre-ticked; ticking is disabled once `saved` + picked reaches `maxProducts`, with the line "Your plan allows N products". Link "Show N hidden items (samples, free gifts, duplicates)" toggles hidden rows. If `truncated`, a line "Showing the first 1000 products. Use search." Buttons "Next" and "Cancel".
  - **Review mode:** `POST .../short-names` with the picked titles (one call). Each row gets the AI name when not `null`, else the rule name. A 429 or any error keeps the rule names and shows the message in muted text; it never blocks. Every name is an editable input (editing sets `nameEditedByUser: true`). "Save" merges the picked rows into `saved` (replacing by `shopifyId`) and calls `PUT`.
  - All long text wraps (`overflow-wrap: anywhere`); rows use `flex-wrap: wrap` so a 390px screen works.

- [ ] **Step 2: Render** `<ProductsSettings brandId={activeBrandId} brandName={currentBrand?.name} key={activeBrandId} />` in `Settings.tsx` right after the tracked-queries card, using the same `activeBrandId` and brand name variables that page already uses.

- [ ] **Step 3: Verify.** `cd frontend && npm run build` passes; oxlint shows no new warnings in the changed files.

- [ ] **Step 4: Commit** `feat(products): products section in settings with shopify import`

---

### Task 5: Products page, Overview card, product page check

**Files:**
- Create: `frontend/src/components/ProductVisibility.tsx` (hook + `ProductsCard` + `ProductsTable`)
- Create: `frontend/src/pages/Products.tsx`
- Modify: `frontend/src/router.tsx` (route `products`), `frontend/src/components/AppLayout.tsx` (nav item after Competitors: `{ path: '/products', label: 'Products', icon: '◫' }`)
- Modify: `frontend/src/pages/Overview.tsx` (card after `LostToCard`)
- Modify: `frontend/src/components/AiViewPanel.tsx`, `frontend/src/pages/WebsiteAudit.tsx` (product URL from the query string)

**Interfaces:**
- Consumes: `GET /brands/:id/products/visibility`, `GET /brands/:id/products`, `PATCH /brands/:id` (to add a question, as `LostTo.tsx` does for competitors, with `queries: [...brand.queries, newQuery]`), `POST /brands/:id/audit/ai-view` with `{ url }`.
- Produces: `ProductsCard({ brandId })`, `ProductsTable({ brandId })`; `AiViewPanel` gains an optional `productUrl?: string` prop.

- [ ] **Step 1: `ProductVisibility.tsx`.** `useProductVisibility(brandId)` loads the visibility (and on error sets an error string; the card shows "Couldn't load product results." and the rest of the page stays).
  - **`ProductsTable`** rows: image, short name + price, "x/y answers" (or a grey "Not seen" chip), best position (`#2` or `—`), models as small tags, change vs previous scan (`↑ from 1` / `↓ from 3` / nothing when `previousAnswers` is null or equal). Clicking a row opens: every hit as `ChatGPT · #1 · “q1”` with the answer line under it in muted text. A not-seen row opens instead: the suggested questions with an "Add" button each (PATCH the brand queries; on the plan's 403 show the server message), and "Check this page →" linking to `/audit?product=<encodeURIComponent(url)>` (hidden when `url` is empty). `genericName` rows show "This name is too common to count. Make it more specific in Settings → Products." `overLimit` rows are greyed with "Upgrade to track".
  - **Empty states:** no products → text "Import your products to see which ones AI recommends." + link to `/settings`; `!textAvailable` with products → "Results after your next scan."; products counted but all not seen → "None of your products was named in the last N answers. Questions that name a product type and budget help:" followed by the not-seen rows.
  - **`ProductsCard`** (Overview): title "Your products in AI answers", the top 3 named products as `Silk Oud · 3/14 · best #2`, the line "`notSeen` of `counted` products were not named in any AI answer", and "See all →" to `/products`. Renders nothing when the brand has no products.

- [ ] **Step 2: Page and wiring.** `pages/Products.tsx` reads `activeBrandId` from `useOutletContext` like `Competitors.tsx` and renders a header ("Products", sub line "Which of your products AI engines name, from the latest scan.") and `<ProductsTable brandId={activeBrandId} key={activeBrandId} />`. Add the route and the nav item. In `Overview.tsx` render `<ProductsCard brandId={activeBrandId} key={activeBrandId} />` after `LostToCard`.

- [ ] **Step 3: Product page check.** `WebsiteAudit.tsx` reads `product` from `useSearchParams()` and passes `productUrl` to `AiViewPanel`. In `AiViewPanel`, when `productUrl` is set, show the line "Checking <productUrl>" above the Compare button, and send `api.post(url, productUrl ? { url: productUrl } : undefined)`.

- [ ] **Step 4: Verify.** `npm run build` passes; no new oxlint warnings in changed files.

- [ ] **Step 5: Commit** `feat(products): products page, overview card and product page check`

---

### Task 6: Verify, PR, staging, Test Sheet

- [ ] A QA agent runs the app locally from `C:\DDRIVE\GEO` (email off: blank SMTP vars, verified in the log; local Mongo only; throwaway users, never care@hasanoud.com or an admin account; at most 5 real AI calls) with the Playwright browser:
  - Settings → Products: import from `https://hasanoud.com`, search, hidden items link, limit on the Free plan (3), Next (AI names), edit a name, Save, Refresh keeps the edited name, manual add on a brand whose site is not Shopify, 403 when saving too many.
  - Products page and Overview card after a scan (run one scan with the cheapest setup, or insert mention rows with realistic `rawText` into the local DB), row details, "Add" a suggested question, "Check this page" opens the AI view with the product URL, a URL from another host refused (422), generic name hint, phone width 390px.
  - Negative: unauthenticated calls 401, another org's brand 404, 11th AI naming call 429 (simulate with cost-log rows), import on a non-Shopify site.
  - Cleanup of all test data, servers stopped, repo back on `main`.
- [ ] Fix findings, push the branch, open the PR (body in the style of PR #25, no Claude attribution), wait for green checks, hand over the merge command.
- [ ] After the merge: wait for the Images run, deploy staging with the merge SHA, check the Products import on the staging Hasan Oud brand, add Test Sheet feature `N6` with positive and negative cases (Hinglish), then prod when the user asks.
