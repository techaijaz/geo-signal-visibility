# Free AI Visibility Checker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public checker on the marketing website: site URL → 3 buyer questions → ChatGPT + Gemini answers → "named in N of 6" free, brands named instead after an OTP-verified email, report email, signup pre-fill, admin leads page.

**Architecture:** Public routes under `/api/v1/public/free-check` (CORS for the website origin only) create a `freeCheck` document and queue a BullMQ `free-check` job in the existing worker. The job asks each question through the existing cached scan path (`aiService.callModelCached`) and the existing brand extraction. Limits and the ip+domain cache live in Redis behind a small store interface (in-memory in checks). Leads are kept in Mongo; the website page is a static Astro page with a client script.

**Tech Stack:** Node 22, Express, TypeScript, Mongoose, BullMQ + ioredis, Joi, React 19 (app), Astro 7 (website), Cloudflare Turnstile, `disposable-email-domains`.

**Spec:** `docs/superpowers/specs/2026-10-10-free-checker-design.md`

## Global Constraints

- Engines: ChatGPT `OpenAI` / `gpt-4o-mini` and Gemini `Google` / `gemini-flash-latest`; 3 questions × 2 engines = 6 answers per check.
- Limits per IST day: IP 3 checks, 10 site lookups, 5 codes; email 3 codes, 2 fresh checks; global checks = admin setting `freeCheckDailyLimit` (default 150); alert at 80% once per day.
- Cache `ip + domain` 24 h; removed after email verification.
- OTP: 6 digits, stored hashed, 10 minutes, 5 attempts.
- `checkId`: 24 random bytes, base64url. Never the Mongo `_id`.
- IP stored only as `sha256(FREE_CHECK_SALT + ip)`; `FREE_CHECK_SALT` falls back to `config.ACCESS_TOKEN.SECRET`.
- Half result never contains other brands' names; names only from `/verify`.
- `freeChecks` TTL 30 days; `leads` kept.
- Market `'IN'` only; country = `'IN'` when the browser time zone is `Asia/Kolkata`/`Asia/Calcutta`, else the time zone string.
- Turnstile: `TURNSTILE_SECRET_KEY` (API env), `PUBLIC_TURNSTILE_SITE_KEY` (website build var). Missing secret: skipped outside production, refused in production.
- Every AI call logged in `costLog` with `purpose: 'free-check'`.
- Commit messages: conventional, header ≤ 100 chars, body lines ≤ 100, **no Co-Authored-By / Claude trailers** (repo rule).
- Local checks never send email: run them with `SMTP_HOST= SMTP_USER= SMTP_PASS=`.
- Checks that import the DB service end with `process.exit(0)` (winston-mongodb keeps the process alive).

## Review Focus

- **Same visitor, same site, different questions** → must return the cached check (no new AI calls) until the email is verified. Test in Task 6.
- **Both engines fail** (keys missing, 429) → status `failed`, global counter refunded, not cached; one engine failing → `done` with `failedEngines`. Test in Task 4.
- **`/verify` called with a wrong `checkId` or after 5 bad codes** → 404 / 429, never another check's names. Test in Task 6.
- **Homepage that is a JS shell / redirects / non-HTML** → empty brand + category, never a 500. Test in Task 2.
- **Budget hit between `site` and `check`** → `waiting-email`, and after verify the check is scheduled for 06:00 IST next day (not run now). Test in Task 6.

---

### Task 1: Questions — English coverage and `freeCheckQuestions`

**Files:**
- Modify: `backend/src/service/querySuggestionService.ts` (TEMPLATES lists, add export)
- Create: `backend/src/checks/freeCheck.check.ts`

**Interfaces:**
- Produces: `freeCheckQuestions(category: string, market?: 'IN'): ISuggestedQuery[]` — the category's template questions without the branded one; every vertical list has ≥ 4 `EN`.

- [ ] **Step 1: Write the failing check**

Create `backend/src/checks/freeCheck.check.ts`:

```ts
/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/freeCheck.check.ts
import assert from 'assert'
import { freeCheckQuestions } from '../service/querySuggestionService'

const CATEGORIES = [
    'Fragrances & Perfumes', 'Skincare', 'Beauty & Cosmetics', 'Fashion & Apparel', 'Jewellery & Watches', 'Food & Beverages',
    'Health & Wellness', 'Baby & Kids', 'Home & Kitchen', 'Electronics', 'Pet Care', 'E-Commerce & Retail',
    'SaaS & Software', 'FinTech & Banking', 'EdTech', 'HealthTech', 'AI & Machine Learning'
]

const run = async () => {
    // Questions: no branded question, at least 4 English per category, no weak "comparison with competitors" lines
    for (const c of CATEGORIES) {
        const qs = freeCheckQuestions(c)
        assert.ok(qs.length >= 7, `${c}: ${qs.length} questions`)
        assert.ok(qs.filter((q) => q.lang === 'EN').length >= 4, `${c}: fewer than 4 EN`)
        assert.ok(!qs.some((q) => /reviews: original/.test(q.text)), `${c}: branded question present`)
        assert.ok(!qs.some((q) => /^(Comparison with|Hidden charges|Course quality|Medicine delivery speed|API performance)/.test(q.text)), `${c}: weak question`)
    }
    console.log('freeCheck checks passed')
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
```

- [ ] **Step 2: Run it — expect FAIL**

Run (from `backend/`): `SMTP_HOST= SMTP_USER= SMTP_PASS= NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/freeCheck.check.ts`
Expected: `freeCheckQuestions is not a function` (or the import error).

- [ ] **Step 3: Add the English questions and fix weak ones**

In `TEMPLATES` (`querySuggestionService.ts`), **append** to the end of each list (order of the first three is the onboarding pre-tick order — do not move them):

```ts
// fragrance
q('Best attar brands in India for long lasting fragrance', 'EN', 'Best-of'),
// skincare
q('Best natural skincare brands in India for sensitive skin', 'EN', 'Best-of'),
// beauty
q('Best affordable makeup brands in India for beginners', 'EN', 'Best-of'),
// fashion
q('Best ethnic wear brands in India for weddings', 'EN', 'Occasion'),
// wellness
q('Best ayurvedic wellness brands in India', 'EN', 'Best-of'),
// jewellery
q('Best silver jewellery brands in India online', 'EN', 'Best-of'),
q('Best watch brands under ₹5000 in India', 'EN', 'Price'),
// food
q('Best healthy snack brands in India', 'EN', 'Best-of'),
q('Best gift hampers to order online in India under ₹1500', 'EN', 'Price'),
// baby
q('Best baby skincare brands in India', 'EN', 'Best-of'),
q('Best organic baby clothes brands in India', 'EN', 'Best-of'),
// home
q('Best home decor brands in India online', 'EN', 'Best-of'),
q('Best cookware brands in India under ₹3000', 'EN', 'Price'),
// electronics
q('Best Indian earbuds brand for bass and battery life', 'EN', 'Best-of'),
q('Best budget power bank brands in India', 'EN', 'Price'),
// pet
q('Best dog food brands in India', 'EN', 'Best-of'),
q('Best pet grooming products online in India', 'EN', 'Direct'),
// retail
q('Best online stores in India for genuine products', 'EN', 'Best-of'),
q('Best Indian D2C brands to buy from online', 'EN', 'Best-of'),
```

Replace these weak lines (same position in their lists):

```ts
// saas: 'Comparison with leading market software competitors'
q('Best alternatives to Zoho for small businesses in India', 'EN', 'Comparison'),
// fintech: 'Hidden charges, user reviews and security features'
q('Which investment app in India has the lowest charges', 'EN', 'Price'),
// edtech: 'Course quality, teacher reviews and certification validity'
q('Best online course platforms in India with valid certificates', 'EN', 'Best-of'),
// healthtech: 'Medicine delivery speed, lab test accuracy and ratings'
q('Best online pharmacy in India for fast medicine delivery', 'EN', 'Best-of'),
// ai: 'API performance, accuracy and pricing breakdown'
q('Best AI tools for small businesses in India', 'EN', 'Best-of'),
```

Then add below `templateQueries`:

```ts
// Free checker: the category's questions without the branded one; one market for now ('IN'),
// so a UAE list can be added without touching the checker
export const freeCheckQuestions = (category: string, market: 'IN' = 'IN'): ISuggestedQuery[] => {
    void market
    return templateQueries(category)
}
```

(`templateQueries(category)` with no brand name never adds the branded question.)

- [ ] **Step 4: Run it — expect PASS**, and run the existing `src/checks/indianQueries.check.ts` the same way (its first-three-order assertions must still pass). If a count assertion there pins old totals, update that number only.

- [ ] **Step 5: Commit**

```bash
git add backend/src/service/querySuggestionService.ts backend/src/checks/freeCheck.check.ts backend/src/checks/indianQueries.check.ts
git commit -m "feat(free-check): english buyer questions for every category"
```

---

### Task 2: Pure helpers — URL, homepage facts, results, days, OTP, email

**Files:**
- Create: `backend/src/service/freeCheck/helpers.ts`
- Create: `backend/src/types/freeCheckTypes.ts`
- Modify: `backend/package.json` (add `disposable-email-domains`)
- Test: `backend/src/checks/freeCheck.check.ts`

**Interfaces:**
- Consumes: `VERTICAL_RULES`-based `detectVertical` (export `verticalOfText` added here), `isNotBrand`, `brandKey` from `competitorService`.
- Produces (all in `helpers.ts`):
  - `normaliseSiteUrl(input: string): { url: string; domain: string } | null`
  - `siteFacts(html: string, categories: string[]): { brandName: string; category: string }`
  - `istDay(now?: Date): string` (`YYYY-MM-DD`), `nextMorningIst(now?: Date): Date` (06:00 IST next day)
  - `newCheckId(): string`, `hashIp(ip: string): string`, `newOtp(): string`, `hashOtp(code: string, checkId: string): string`
  - `isDisposableEmail(email: string): boolean`, `normaliseEmail(input: string): string | null`
  - `countryFromTz(tz: string): string`
  - `halfResult(check: IFreeCheck)`, `fullResult(check: IFreeCheck)` (shapes below)
- Types (`freeCheckTypes.ts`):

```ts
export type FreeCheckEngine = 'ChatGPT' | 'Gemini'
export type FreeCheckStatus = 'queued' | 'running' | 'done' | 'failed' | 'waiting-email' | 'scheduled'
export interface IFreeCheckAnswer { engine: FreeCheckEngine; ok: boolean; named: boolean; position: number | null; brands: string[] }
export interface IFreeCheckQuestion { text: string; answers: IFreeCheckAnswer[] }
export interface IFreeCheck {
    checkId: string; url: string; domain: string; brandName: string; category: string; market: 'IN'
    questions: IFreeCheckQuestion[]; ipHash: string; country: string; status: FreeCheckStatus
    email: string | null; verifiedAt: Date | null; otpHash: string | null; otpExpiresAt: Date | null; otpAttempts: number
    createdAt?: Date
}
```

- [ ] **Step 1: Install the disposable list** (from `backend/`): `npm install disposable-email-domains@1.0.62` — then confirm `node -e "console.log(require('disposable-email-domains').includes('mailinator.com'))"` prints `true`.

- [ ] **Step 2: Add failing assertions** to `run()` in `freeCheck.check.ts` (import the helpers at the top):

```ts
import {
    normaliseSiteUrl, siteFacts, istDay, nextMorningIst, newCheckId, hashOtp, isDisposableEmail, normaliseEmail,
    countryFromTz, halfResult, fullResult
} from '../service/freeCheck/helpers'
import type { IFreeCheck } from '../types/freeCheckTypes'
```

```ts
    // URL
    assert.deepEqual(normaliseSiteUrl('https://www.HasanOud.com/'), { url: 'https://www.hasanoud.com/', domain: 'hasanoud.com' })
    assert.deepEqual(normaliseSiteUrl('hasanoud.com'), { url: 'https://hasanoud.com/', domain: 'hasanoud.com' })
    assert.equal(normaliseSiteUrl('ftp://x.com'), null)
    assert.equal(normaliseSiteUrl('not a url'), null)
    assert.equal(normaliseSiteUrl('http://localhost:3000'), null)

    // Homepage facts (no AI): og:site_name, else <title> before a separator; category by vertical rules
    const cats = ['Fragrances & Perfumes', 'Skincare', 'E-Commerce & Retail']
    assert.deepEqual(
        siteFacts('<meta property="og:site_name" content="Hasan Oud"><title>Buy Attar Online | Hasan Oud</title><meta name="description" content="Pure oud and attar">', cats),
        { brandName: 'Hasan Oud', category: 'Fragrances & Perfumes' }
    )
    assert.deepEqual(siteFacts('<title>Glowleaf – Natural skin care</title>', cats), { brandName: 'Glowleaf', category: 'Skincare' })
    assert.deepEqual(siteFacts('<div id="root"></div>', cats), { brandName: '', category: '' }) // JS shell
    assert.deepEqual(siteFacts('', cats), { brandName: '', category: '' })

    // IST day and next morning
    assert.equal(istDay(new Date('2026-10-10T20:00:00Z')), '2026-10-11') // 01:30 IST
    assert.equal(nextMorningIst(new Date('2026-10-10T10:00:00Z')).toISOString(), '2026-10-11T00:30:00.000Z')

    // Ids, OTP, email
    assert.match(newCheckId(), /^[A-Za-z0-9_-]{32}$/)
    assert.notEqual(newCheckId(), newCheckId())
    assert.equal(hashOtp('123456', 'abc'), hashOtp('123456', 'abc'))
    assert.notEqual(hashOtp('123456', 'abc'), hashOtp('123456', 'abd'))
    assert.equal(isDisposableEmail('x@mailinator.com'), true)
    assert.equal(isDisposableEmail('owner@hasanoud.com'), false)
    assert.equal(normaliseEmail(' Owner@HasanOud.com '), 'owner@hasanoud.com')
    assert.equal(normaliseEmail('nope'), null)
    assert.equal(countryFromTz('Asia/Kolkata'), 'IN')
    assert.equal(countryFromTz('Asia/Dubai'), 'Asia/Dubai')

    // Results: half has counts only, full has names
    const check = {
        checkId: 'c1', brandName: 'Hasan Oud', status: 'done',
        questions: [
            { text: 'q1', answers: [
                { engine: 'ChatGPT', ok: true, named: false, position: null, brands: ['Ajmal', 'Al Haramain'] },
                { engine: 'Gemini', ok: true, named: true, position: 3, brands: ['Ajmal'] }
            ] },
            { text: 'q2', answers: [
                { engine: 'ChatGPT', ok: false, named: false, position: null, brands: [] },
                { engine: 'Gemini', ok: true, named: false, position: null, brands: ['Ajmal', 'Rasasi'] }
            ] }
        ]
    } as unknown as IFreeCheck
    const half = halfResult(check)
    assert.equal(half.namedCount, 1)
    assert.equal(half.total, 3) // failed answers don't count
    assert.equal(half.otherBrandsCount, 3)
    assert.deepEqual(half.failedEngines, [])
    assert.ok(!JSON.stringify(half).includes('Ajmal'))
    const full = fullResult(check)
    assert.deepEqual(full.otherBrands, [{ name: 'Ajmal', count: 3 }, { name: 'Al Haramain', count: 1 }, { name: 'Rasasi', count: 1 }])
```

- [ ] **Step 3: Run — expect FAIL** (module not found).

- [ ] **Step 4: Implement**

In `querySuggestionService.ts` add, below `detectVertical`:

```ts
// Same rules on free text (a homepage title/description), for the free checker's category guess
export const verticalOfText = (text: string): Vertical | null => VERTICAL_RULES.find(([, re]) => re.test(text || ''))?.[0] ?? null
```

Create `backend/src/types/freeCheckTypes.ts` with the types in **Interfaces** above.

Create `backend/src/service/freeCheck/helpers.ts`:

```ts
import crypto from 'crypto'
import config from '../../config/config'
import { detectVertical, verticalOfText } from '../querySuggestionService'
import { brandKey } from '../competitorService'
import type { IFreeCheck } from '../../types/freeCheckTypes'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const DISPOSABLE: Set<string> = new Set(require('disposable-email-domains') as string[])

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$)/i

export const normaliseSiteUrl = (input: string): { url: string; domain: string } | null => {
    const raw = (input || '').trim()
    if (!raw || /\s/.test(raw)) return null
    try {
        const u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`)
        if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.') || PRIVATE_HOST.test(u.hostname)) return null
        const host = u.hostname.toLowerCase()
        return { url: `${u.protocol}//${host}${u.pathname === '' ? '/' : u.pathname}`, domain: host.replace(/^www\./, '') }
    } catch {
        return null
    }
}

const meta = (html: string, re: RegExp) => (html.match(re)?.[1] || '').replace(/&amp;/g, '&').trim()

export const siteFacts = (html: string, categories: string[]): { brandName: string; category: string } => {
    const site = meta(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i)
    const title = meta(html, /<title[^>]*>([^<]*)<\/title>/i)
    const description = meta(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)
    const h1 = meta(html, /<h1[^>]*>([^<]*)<\/h1>/i)
    // "Buy Attar Online | Hasan Oud" → the part that looks like a name: og:site_name, else the shortest title part
    const parts = title.split(/\s[|–—-]\s/).map((p) => p.trim()).filter(Boolean)
    const brandName = site || (parts.length ? parts.reduce((a, b) => (b.length < a.length ? b : a)) : '')
    const vertical = verticalOfText(`${title} ${description} ${h1}`)
    const category = vertical ? categories.find((c) => detectVertical(c) === vertical) || '' : ''
    return { brandName: brandName.slice(0, 80), category }
}

const IST_OFFSET_MS = 330 * 60 * 1000
export const istDay = (now = new Date()) => new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
export const nextMorningIst = (now = new Date()) => {
    const day = istDay(new Date(now.getTime() + 24 * 60 * 60 * 1000))
    return new Date(new Date(`${day}T06:00:00.000Z`).getTime() - IST_OFFSET_MS)
}

const salt = () => process.env.FREE_CHECK_SALT || config.ACCESS_TOKEN.SECRET || 'dev'
export const newCheckId = () => crypto.randomBytes(24).toString('base64url')
export const hashIp = (ip: string) => crypto.createHash('sha256').update(`${salt()}:${ip}`).digest('hex')
export const newOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
export const hashOtp = (code: string, checkId: string) => crypto.createHmac('sha256', salt()).update(`${checkId}:${code}`).digest('hex')

export const normaliseEmail = (input: string): string | null => {
    const e = (input || '').trim().toLowerCase()
    return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) && e.length <= 254 ? e : null
}
export const isDisposableEmail = (email: string) => DISPOSABLE.has(email.split('@')[1] || '')
export const countryFromTz = (tz: string) => (/^Asia\/(Kolkata|Calcutta)$/.test(tz || '') ? 'IN' : (tz || '').slice(0, 64))

const answers = (check: IFreeCheck) => check.questions.flatMap((q) => q.answers)

export const halfResult = (check: IFreeCheck) => {
    const ok = answers(check).filter((a) => a.ok)
    const engines = ['ChatGPT', 'Gemini'] as const
    return {
        status: check.status,
        brandName: check.brandName,
        questions: check.questions.map((q) => ({ text: q.text, engines: q.answers.map(({ engine, ok, named, position }) => ({ engine, ok, named, position })) })),
        namedCount: ok.filter((a) => a.named).length,
        total: ok.length,
        otherBrandsCount: new Set(ok.flatMap((a) => a.brands.map(brandKey))).size,
        failedEngines: check.status === 'done' ? engines.filter((e) => !answers(check).some((a) => a.engine === e && a.ok)) : []
    }
}

export const fullResult = (check: IFreeCheck) => {
    const counts = new Map<string, { name: string; count: number }>()
    for (const a of answers(check).filter((x) => x.ok)) {
        for (const name of a.brands) {
            const k = brandKey(name)
            const row = counts.get(k) ?? { name, count: 0 }
            row.count++
            counts.set(k, row)
        }
    }
    return { ...halfResult(check), otherBrands: [...counts.values()].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)) }
}
```

- [ ] **Step 5: Run — expect PASS.** Then `npx tsc --noEmit -p .` and `npx eslint src/service/freeCheck src/types/freeCheckTypes.ts`.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/service/querySuggestionService.ts backend/src/service/freeCheck/helpers.ts backend/src/types/freeCheckTypes.ts backend/src/checks/freeCheck.check.ts
git commit -m "feat(free-check): url, homepage facts, otp and result helpers"
```

---

### Task 3: Limits and cache store (Redis, with an in-memory twin)

**Files:**
- Create: `backend/src/service/freeCheck/store.ts`
- Test: `backend/src/checks/freeCheck.check.ts`

**Interfaces:**
- Produces:

```ts
export interface IFreeCheckStore {
    incr(key: string, ttlSeconds: number): Promise<number>
    decr(key: string): Promise<void>
    get(key: string): Promise<string | null>
    set(key: string, value: string, ttlSeconds: number): Promise<void>
    del(key: string): Promise<void>
    setOnce(key: string, ttlSeconds: number): Promise<boolean> // true the first time (alert once per day)
}
export const memoryStore: () => IFreeCheckStore
export const redisStore: () => IFreeCheckStore
export const consume: (store: IFreeCheckStore, key: string, limit: number, day: string) => Promise<boolean> // false = over limit (and not counted)
export const refund: (store: IFreeCheckStore, key: string, day: string) => Promise<void>
export const KEYS: { ipChecks(ipHash): string; ipSites(ipHash): string; ipCodes(ipHash): string; emailCodes(email): string; emailChecks(email): string; global: string; cache(ipHash, domain): string; alert: string }
```

- [ ] **Step 1: Add failing assertions** to `run()`:

```ts
import { memoryStore, consume, refund, KEYS } from '../service/freeCheck/store'
```

```ts
    // Limits: counted per day key; over the limit is refused and not counted; refund gives one back
    const s = memoryStore()
    const day = '2026-10-10'
    assert.equal(await consume(s, KEYS.ipChecks('h'), 3, day), true)
    assert.equal(await consume(s, KEYS.ipChecks('h'), 3, day), true)
    assert.equal(await consume(s, KEYS.ipChecks('h'), 3, day), true)
    assert.equal(await consume(s, KEYS.ipChecks('h'), 3, day), false)
    await refund(s, KEYS.ipChecks('h'), day)
    assert.equal(await consume(s, KEYS.ipChecks('h'), 3, day), true)
    assert.equal(await consume(s, KEYS.ipChecks('h'), 3, '2026-10-11'), true) // new day
    await s.set(KEYS.cache('h', 'hasanoud.com'), 'c1', 60)
    assert.equal(await s.get(KEYS.cache('h', 'hasanoud.com')), 'c1')
    await s.del(KEYS.cache('h', 'hasanoud.com'))
    assert.equal(await s.get(KEYS.cache('h', 'hasanoud.com')), null)
    assert.equal(await s.setOnce(KEYS.alert + day, 60), true)
    assert.equal(await s.setOnce(KEYS.alert + day, 60), false)
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `backend/src/service/freeCheck/store.ts`:

```ts
import IORedis from 'ioredis'
import { connection } from '../queueService'

export interface IFreeCheckStore {
    incr(key: string, ttlSeconds: number): Promise<number>
    decr(key: string): Promise<void>
    get(key: string): Promise<string | null>
    set(key: string, value: string, ttlSeconds: number): Promise<void>
    del(key: string): Promise<void>
    setOnce(key: string, ttlSeconds: number): Promise<boolean>
}

const DAY_TTL = 26 * 60 * 60 // a day key outlives its IST day

export const KEYS = {
    ipChecks: (ip: string) => `fc:ip:checks:${ip}:`,
    ipSites: (ip: string) => `fc:ip:sites:${ip}:`,
    ipCodes: (ip: string) => `fc:ip:codes:${ip}:`,
    emailCodes: (email: string) => `fc:email:codes:${email}:`,
    emailChecks: (email: string) => `fc:email:checks:${email}:`,
    global: 'fc:global:',
    cache: (ip: string, domain: string) => `fc:cache:${ip}:${domain}`,
    alert: 'fc:alert:'
}

export const consume = async (store: IFreeCheckStore, key: string, limit: number, day: string) => {
    const n = await store.incr(key + day, DAY_TTL)
    if (n > limit) {
        await store.decr(key + day)
        return false
    }
    return true
}
export const refund = (store: IFreeCheckStore, key: string, day: string) => store.decr(key + day)

export const memoryStore = (): IFreeCheckStore => {
    const m = new Map<string, string>()
    return {
        incr: async (k) => {
            const n = Number(m.get(k) || 0) + 1
            m.set(k, String(n))
            return n
        },
        decr: async (k) => void m.set(k, String(Math.max(0, Number(m.get(k) || 0) - 1))),
        get: async (k) => m.get(k) ?? null,
        set: async (k, v) => void m.set(k, v),
        del: async (k) => void m.delete(k),
        setOnce: async (k) => (m.has(k) ? false : (m.set(k, '1'), true))
    }
}

let client: IORedis | null = null
export const redisStore = (): IFreeCheckStore => {
    client ??= new IORedis({ ...connection, maxRetriesPerRequest: 1, enableOfflineQueue: true })
    const r = client
    return {
        incr: async (k, ttl) => {
            const [[, n]] = (await r.multi().incr(k).expire(k, ttl, 'NX').exec()) as [[null, number]]
            return n
        },
        decr: async (k) => void (await r.decr(k)),
        get: (k) => r.get(k),
        set: async (k, v, ttl) => void (await r.set(k, v, 'EX', ttl)),
        del: async (k) => void (await r.del(k)),
        setOnce: async (k, ttl) => (await r.set(k, '1', 'EX', ttl, 'NX')) === 'OK'
    }
}
```

- [ ] **Step 4: Run — expect PASS**; tsc + eslint as in Task 2.

- [ ] **Step 5: Commit** — `git commit -m "feat(free-check): daily limits and cache store"` (add `store.ts` + check).

---

### Task 4: Models, setting, and the check job

**Files:**
- Create: `backend/src/model/freeCheckModel.ts`, `backend/src/model/leadModel.ts`, `backend/src/model/appSettingModel.ts`
- Create: `backend/src/service/freeCheck/runFreeCheck.ts`
- Modify: `backend/src/service/queueService.ts` (queue + enqueue), `backend/src/service/workerService.ts` (worker)
- Create: `backend/src/checks/freeCheckRun.check.ts` (needs local Mongo)

**Interfaces:**
- Consumes: `aiService.callModelCached(provider, modelId, text)`, `aiService.parseMentionFromText(text, brand)`, `extractBrands(answers, ownBrand)`, `withAiCallContext({ purpose }, fn)` from `costLogService`.
- Produces:
  - `freeCheckModel` (fields = `IFreeCheck`, `checkId` unique, TTL index on `createdAt` 30 days)
  - `leadModel` `{ email (unique), domain, brandName, category, market, country, checkIds: string[], marketingConsent, consentAt, verifiedAt, signedUpAt, createdAt }`
  - `getSetting<T>(key: string, fallback: T): Promise<T>`, `setSetting(key: string, value: unknown): Promise<void>` in `appSettingModel.ts`
  - `ENGINES: Array<{ engine: FreeCheckEngine; provider: string; modelId: string }>`
  - `runFreeCheck(checkId: string, deps?: { ask?: (provider, modelId, text) => Promise<string | null>; extract?: typeof extractBrands; store?: IFreeCheckStore; now?: Date }): Promise<FreeCheckStatus>`
  - `enqueueFreeCheckJob(checkId: string, runAt?: Date): Promise<Job | null>`

- [ ] **Step 1: Write the failing run check** `backend/src/checks/freeCheckRun.check.ts`:

```ts
/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/freeCheckRun.check.ts (needs the local Mongo)
import assert from 'assert'
import mongoose from 'mongoose'
import freeCheckModel from '../model/freeCheckModel'
import { runFreeCheck } from '../service/freeCheck/runFreeCheck'
import { memoryStore, KEYS } from '../service/freeCheck/store'
import { istDay } from '../service/freeCheck/helpers'

const base = (checkId: string) => ({
    checkId, url: 'https://hasanoud.com/', domain: 'hasanoud.com', brandName: 'Hasan Oud', category: 'Fragrances & Perfumes',
    market: 'IN', ipHash: 'h', country: 'IN', status: 'queued',
    questions: ['best attar', 'oud under 1000', 'eid attar'].map((text) => ({ text, answers: [] }))
})

const run = async () => {
    await mongoose.connect('mongodb://127.0.0.1:27017/signal_freecheck_check')
    await freeCheckModel.deleteMany({})
    const extract = async (answers: { id: string; text: string }[]) =>
        new Map(answers.map((a) => [a.id, a.text.includes('Ajmal') ? [{ name: 'Ajmal', position: 1 }] : []]))

    // Both engines answer: 6 answers, brand found where named
    await freeCheckModel.create(base('ok1'))
    const ask = async (provider: string) => (provider === 'OpenAI' ? '1. Ajmal\n2. Hasan Oud' : 'Try Ajmal')
    assert.equal(await runFreeCheck('ok1', { ask, extract: extract as never, store: memoryStore() }), 'done')
    const ok1 = await freeCheckModel.findOne({ checkId: 'ok1' }).lean()
    assert.equal(ok1!.questions[0].answers.length, 2)
    assert.equal(ok1!.questions[0].answers.find((a) => a.engine === 'ChatGPT')!.named, true)
    assert.equal(ok1!.questions[0].answers.find((a) => a.engine === 'Gemini')!.named, false)
    assert.deepEqual(ok1!.questions[0].answers[0].brands, ['Ajmal'])

    // One engine fails: still done, failed answers marked ok=false
    await freeCheckModel.create(base('half1'))
    const askHalf = async (provider: string) => (provider === 'OpenAI' ? null : 'Ajmal')
    assert.equal(await runFreeCheck('half1', { ask: askHalf, extract: extract as never, store: memoryStore() }), 'done')

    // Both fail: failed, global counter refunded
    const store = memoryStore()
    const day = istDay()
    await store.incr(KEYS.global + day, 60)
    await freeCheckModel.create(base('fail1'))
    assert.equal(await runFreeCheck('fail1', { ask: async () => null, extract: extract as never, store }), 'failed')
    assert.equal(await store.get(KEYS.global + day), '0')

    // Unknown id: nothing happens
    assert.equal(await runFreeCheck('nope', { ask, extract: extract as never, store: memoryStore() }), 'failed')

    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
    console.log('freeCheckRun checks passed')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
```

- [ ] **Step 2: Run — expect FAIL** (`SMTP_HOST= SMTP_USER= SMTP_PASS= NODE_ENV=development npx ts-node --transpile-only src/checks/freeCheckRun.check.ts`).

- [ ] **Step 3: Models**

`backend/src/model/freeCheckModel.ts`:

```ts
import mongoose from 'mongoose'
import type { IFreeCheck } from '../types/freeCheckTypes'

const answerSchema = new mongoose.Schema(
    { engine: String, ok: Boolean, named: Boolean, position: { type: Number, default: null }, brands: { type: [String], default: [] } },
    { _id: false }
)

const freeCheckSchema = new mongoose.Schema<IFreeCheck>(
    {
        checkId: { type: String, required: true, unique: true },
        url: { type: String, required: true },
        domain: { type: String, required: true },
        brandName: { type: String, required: true },
        category: { type: String, required: true },
        market: { type: String, default: 'IN' },
        questions: { type: [new mongoose.Schema({ text: String, answers: { type: [answerSchema], default: [] } }, { _id: false })], default: [] },
        ipHash: { type: String, required: true },
        country: { type: String, default: '' },
        status: { type: String, enum: ['queued', 'running', 'done', 'failed', 'waiting-email', 'scheduled'], default: 'queued' },
        email: { type: String, default: null },
        verifiedAt: { type: Date, default: null },
        otpHash: { type: String, default: null },
        otpExpiresAt: { type: Date, default: null },
        otpAttempts: { type: Number, default: 0 }
    },
    { timestamps: true }
)

// Visitors' checks are short-lived; the lead keeps what matters
freeCheckSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 })

export default mongoose.model<IFreeCheck>('FreeCheck', freeCheckSchema)
```

`backend/src/model/leadModel.ts`:

```ts
import mongoose from 'mongoose'

export interface ILead {
    email: string; domain: string; brandName: string; category: string; market: string; country: string
    checkIds: string[]; marketingConsent: boolean; consentAt: Date | null; verifiedAt: Date; signedUpAt: Date | null
    createdAt?: Date
}

const leadSchema = new mongoose.Schema<ILead>(
    {
        email: { type: String, required: true, unique: true },
        domain: { type: String, default: '' },
        brandName: { type: String, default: '' },
        category: { type: String, default: '' },
        market: { type: String, default: 'IN' },
        country: { type: String, default: '' },
        checkIds: { type: [String], default: [] },
        marketingConsent: { type: Boolean, default: false },
        consentAt: { type: Date, default: null },
        verifiedAt: { type: Date, required: true },
        signedUpAt: { type: Date, default: null }
    },
    { timestamps: true }
)

export default mongoose.model<ILead>('Lead', leadSchema)
```

`backend/src/model/appSettingModel.ts`:

```ts
import mongoose from 'mongoose'

// Small admin-editable settings that must change without a deploy
const appSettingSchema = new mongoose.Schema({ key: { type: String, required: true, unique: true }, value: mongoose.Schema.Types.Mixed }, { timestamps: true })
const appSettingModel = mongoose.model('AppSetting', appSettingSchema)

export const getSetting = async <T>(key: string, fallback: T): Promise<T> => {
    const doc = await appSettingModel.findOne({ key }).lean()
    return doc ? (doc.value as T) : fallback
}
export const setSetting = async (key: string, value: unknown) => {
    await appSettingModel.updateOne({ key }, { $set: { value } }, { upsert: true })
}
export default appSettingModel
```

- [ ] **Step 4: The job** `backend/src/service/freeCheck/runFreeCheck.ts`:

```ts
import aiService from '../aiService'
import freeCheckModel from '../../model/freeCheckModel'
import { extractBrands } from '../brandExtractionService'
import { withAiCallContext } from '../costLogService'
import { istDay } from './helpers'
import { KEYS, redisStore, refund, type IFreeCheckStore } from './store'
import type { FreeCheckEngine, FreeCheckStatus, IFreeCheckAnswer } from '../../types/freeCheckTypes'
import logger from '../../util/loger'

export const ENGINES: Array<{ engine: FreeCheckEngine; provider: string; modelId: string }> = [
    { engine: 'ChatGPT', provider: 'OpenAI', modelId: 'gpt-4o-mini' },
    { engine: 'Gemini', provider: 'Google', modelId: 'gemini-flash-latest' }
]

interface IDeps {
    ask?: (provider: string, modelId: string, text: string) => Promise<string | null>
    extract?: typeof extractBrands
    store?: IFreeCheckStore
    now?: Date
}

export const runFreeCheck = async (checkId: string, deps: IDeps = {}): Promise<FreeCheckStatus> => {
    const ask = deps.ask ?? aiService.callModelCached
    const extract = deps.extract ?? extractBrands
    const check = await freeCheckModel.findOneAndUpdate(
        { checkId, status: { $in: ['queued', 'scheduled'] } },
        { $set: { status: 'running' } },
        { new: true }
    )
    if (!check) return 'failed'

    try {
        const pairs = check.questions.flatMap((q, qi) => ENGINES.map((e) => ({ qi, e, text: q.text })))
        const texts = await withAiCallContext({ purpose: 'free-check' }, () =>
            Promise.all(pairs.map((p) => ask(p.e.provider, p.e.modelId, p.text).catch(() => null)))
        )
        const answered = pairs.map((p, i) => ({ ...p, text: texts[i] })).filter((p) => p.text)
        const brands = answered.length
            ? await extract(answered.map((p, i) => ({ id: String(i), text: p.text as string })), check.brandName).catch(() => new Map())
            : new Map()

        const questions = check.questions.map((q, qi) => ({
            text: q.text,
            answers: ENGINES.map((e): IFreeCheckAnswer => {
                const i = answered.findIndex((p) => p.qi === qi && p.e.engine === e.engine)
                if (i < 0) return { engine: e.engine, ok: false, named: false, position: null, brands: [] }
                const parsed = aiService.parseMentionFromText(answered[i].text as string, check.brandName)
                return {
                    engine: e.engine,
                    ok: true,
                    named: parsed.mentioned,
                    position: parsed.position,
                    brands: (brands.get(String(i)) || []).map((b: { name: string }) => b.name)
                }
            })
        }))
        const status: FreeCheckStatus = answered.length ? 'done' : 'failed'
        if (status === 'failed') await refund(deps.store ?? redisStore(), KEYS.global, istDay(deps.now))
        await freeCheckModel.updateOne({ checkId }, { $set: { questions, status } })
        return status
    } catch (err) {
        logger.error(`[freeCheck] Run ${checkId} failed`, { meta: err })
        await refund(deps.store ?? redisStore(), KEYS.global, istDay(deps.now)).catch(() => undefined)
        await freeCheckModel.updateOne({ checkId }, { $set: { status: 'failed' } })
        return 'failed'
    }
}
```

Check `withAiCallContext`'s parameter type in `costLogService.ts`; if `brandId` is required there, make it optional (`brandId?: string`) — cost logs for the free check have no brand. Add `'free-check'` to the `purpose` union/enum in `costLogModel` if it is an enum.

- [ ] **Step 5: Queue and worker**

`queueService.ts` — next to the other queues:

```ts
export const freeCheckQueue = new Queue('free-check', { connection, defaultJobOptions: { ...defaultJobOptions, attempts: 1 } })

// One job per check; a delayed job runs the next morning when the day's budget was used up
export const enqueueFreeCheckJob = async (checkId: string, runAt?: Date) => {
    try {
        const delay = runAt ? Math.max(0, runAt.getTime() - Date.now()) : 0
        return await enqueueWithTimeout(freeCheckQueue.add('free-check-job', { checkId }, { jobId: `free-check-${checkId}`, delay }), 1500)
    } catch (err) {
        logger.error(`[BullMQ Queue Error] Failed to enqueue free check ${checkId}:`, { meta: err })
        return null
    }
}
```

`workerService.ts` — after `citationWorker`, and add `freeCheckWorker` to the `workers` array:

```ts
    const freeCheckWorker = new Worker<{ checkId: string }>(
        'free-check',
        async (job: Job<{ checkId: string }>) => runFreeCheck(job.data.checkId),
        { connection, concurrency: 2 }
    )
```

(import `runFreeCheck` from `./freeCheck/runFreeCheck`). Attempts are 1: a retry would pay for the same answers again; the visitor can retry.

- [ ] **Step 6: Run — expect PASS**; also rerun `freeCheck.check.ts`; tsc; eslint.

- [ ] **Step 7: Commit** — `git commit -m "feat(free-check): models, setting and the check job"` (models, runFreeCheck, queue/worker, check, costLog changes).

---

### Task 5: Turnstile, OTP email and report email

**Files:**
- Create: `backend/src/service/freeCheck/turnstile.ts`, `backend/src/service/freeCheck/emails.ts`
- Test: `backend/src/checks/freeCheck.check.ts`

**Interfaces:**
- Produces:
  - `verifyTurnstile(token: string | undefined, ip: string, fetcher?: typeof fetch): Promise<boolean>`
  - `otpEmail(code: string): { subject: string; text: string; html: string }`
  - `reportEmail(check: IFreeCheck, email: string, consent: boolean): { subject: string; text: string; html: string }`
  - `leadUnsubscribeUrl(email: string): string`, `verifyLeadUnsubscribe(email: string, token: string): boolean`

- [ ] **Step 1: Failing assertions** (add imports; config is read at call time):

```ts
import { verifyTurnstile } from '../service/freeCheck/turnstile'
import { otpEmail, reportEmail, leadUnsubscribeUrl, verifyLeadUnsubscribe } from '../service/freeCheck/emails'
```

```ts
    // Turnstile: no secret outside production → allowed; with a secret the siteverify answer decides
    delete process.env.TURNSTILE_SECRET_KEY
    assert.equal(await verifyTurnstile(undefined, '1.1.1.1'), true)
    process.env.TURNSTILE_SECRET_KEY = 's'
    const fake = (success: boolean) => (async () => ({ json: async () => ({ success }) })) as unknown as typeof fetch
    assert.equal(await verifyTurnstile('t', '1.1.1.1', fake(true)), true)
    assert.equal(await verifyTurnstile('t', '1.1.1.1', fake(false)), false)
    assert.equal(await verifyTurnstile(undefined, '1.1.1.1', fake(true)), false)
    delete process.env.TURNSTILE_SECRET_KEY

    // Emails
    assert.ok(otpEmail('482913').text.includes('482913'))
    const mail = reportEmail(check, 'owner@hasanoud.com', true)
    assert.ok(mail.subject.includes('Hasan Oud') && mail.subject.includes('1 of 3'))
    assert.ok(mail.html.includes('Ajmal') && mail.html.includes('/signup?fc=c1'))
    assert.ok(mail.html.includes('unsubscribe'))
    assert.ok(!reportEmail(check, 'owner@hasanoud.com', false).html.includes('unsubscribe'))
    const evil = { ...check, brandName: '<b>x</b>' } as IFreeCheck
    assert.ok(!reportEmail(evil, 'a@b.co', false).html.includes('<b>x</b>'))
    const u = new URL(leadUnsubscribeUrl('owner@hasanoud.com'))
    assert.equal(verifyLeadUnsubscribe('owner@hasanoud.com', u.searchParams.get('t')!), true)
    assert.equal(verifyLeadUnsubscribe('other@hasanoud.com', u.searchParams.get('t')!), false)
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

`turnstile.ts`:

```ts
import config from '../../config/config'
import { EApplicationEnvionment } from '../../constent/application'

export const verifyTurnstile = async (token: string | undefined, ip: string, fetcher: typeof fetch = fetch): Promise<boolean> => {
    const secret = process.env.TURNSTILE_SECRET_KEY
    if (!secret) return config.ENV !== EApplicationEnvionment.PRODUCTION
    if (!token) return false
    try {
        const res = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body: new URLSearchParams({ secret, response: token, remoteip: ip }),
            signal: AbortSignal.timeout(5000)
        })
        return ((await res.json()) as { success?: boolean }).success === true
    } catch {
        return false
    }
}
```

(Check the import path of `EApplicationEnvionment` against `app.ts` and use the same.)

`emails.ts`:

```ts
import { unsubscribeToken, verifyUnsubscribeToken } from '../reportService/weeklyReport'
import config from '../../config/config'
import { fullResult } from './helpers'
import type { IFreeCheck } from '../../types/freeCheckTypes'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const appUrl = () => (config.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')
const apiUrl = () => (config.SERVER_URL || `http://localhost:${config.PORT || 8080}`).replace(/\/$/, '')

// Same HMAC as the weekly report, under a fixed "lead" scope
export const leadUnsubscribeUrl = (email: string) =>
    `${apiUrl()}/api/v1/public/leads/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubscribeToken('lead', email)}`
export const verifyLeadUnsubscribe = (email: string, token: string) => verifyUnsubscribeToken('lead', email, token)

export const otpEmail = (code: string) => ({
    subject: `Your Signal check code: ${code}`,
    text: `Your code is ${code}. It works for 10 minutes.\n\nIf you didn't ask for an AI visibility check at geosignalai.com, ignore this email.`,
    html: `<p>Your code is <b style="font-size:20px;letter-spacing:3px">${code}</b>. It works for 10 minutes.</p><p style="color:#666">If you didn't ask for an AI visibility check at geosignalai.com, ignore this email.</p>`
})

export const reportEmail = (check: IFreeCheck, email: string, consent: boolean) => {
    const r = fullResult(check)
    const signup = `${appUrl()}/signup?fc=${encodeURIComponent(check.checkId)}`
    const rows = check.questions
        .map((q) => {
            const cells = q.answers
                .map((a) => `${a.engine}: ${!a.ok ? 'no answer' : a.named ? `named${a.position ? ` (#${a.position})` : ''}` : 'not named'}`)
                .join(' · ')
            const others = [...new Set(q.answers.flatMap((a) => a.brands))]
            return `<tr><td style="padding:8px 0"><b>${esc(q.text)}</b><br/>${esc(cells)}${others.length ? `<br/>Named instead: ${esc(others.join(', '))}` : ''}</td></tr>`
        })
        .join('')
    const top = r.otherBrands.slice(0, 5).map((b) => `${b.name} (${b.count}/${r.total})`).join(', ')
    const footer = consent
        ? `<p style="color:#888;font-size:12px">You asked for this report at geosignalai.com. <a href="${leadUnsubscribeUrl(email)}">Stop tips and updates (unsubscribe)</a></p>`
        : `<p style="color:#888;font-size:12px">You asked for this report at geosignalai.com.</p>`
    const subject = `${check.brandName} on ChatGPT and Gemini: named in ${r.namedCount} of ${r.total} answers`
    const html = `<h2>${esc(subject)}</h2>${top ? `<p>AI recommends instead: <b>${esc(top)}</b></p>` : ''}<table>${rows}</table>
<p>AI recommends brands it has read about in many places — reviews, lists, comparison pages.</p>
<p><a href="${signup}" style="background:#0F2629;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Create a free account</a> and track 15 questions across 5 AIs every week.</p>${footer}`
    const text = `${subject}\n\n${check.questions.map((q) => `- ${q.text}`).join('\n')}\n\nAI recommends instead: ${top || '—'}\n\nCreate a free account: ${signup}`
    return { subject, text, html }
}
```

- [ ] **Step 4: Run — expect PASS**; tsc; eslint.

- [ ] **Step 5: Commit** — `git commit -m "feat(free-check): turnstile check, code and report emails"`.

---

### Task 6: Public API

**Files:**
- Create: `backend/src/controller/freeCheckController.ts`
- Modify: `backend/src/router/apiRouter.ts`, `backend/src/app.ts` (CORS), `backend/src/service/validationService.ts` (Joi schemas), `backend/.env.example`, `docker-compose.yml` (pass `TURNSTILE_SECRET_KEY`, `FREE_CHECK_SALT`, `WEBSITE_URL` to `api`), `backend/src/config/config.ts` (`WEBSITE_URL`)
- Create: `backend/src/checks/freeCheckApi.check.ts` (needs local Mongo)

**Interfaces:**
- Consumes: everything from Tasks 1–5; `emailService.sendEmail(to[], subject, text, { html })`; `fetchPublicText(url, headers, timeout)`; `categoryModel.find({ isActive: true })`.
- Produces: `freeCheckController.{ site, create, status, sendCode, verify, unsubscribe }` and `freeCheckController.deps` (overridable `store`, `turnstile`, `send`, `fetchHtml`, `enqueue`, `now`) for checks.
- Routes (mounted before `router.use(rateLimit)`? **No** — keep after, the global IP limit applies too):

```ts
router.route('/public/free-check/site').post(freeCheckController.site)
router.route('/public/free-check').post(freeCheckController.create)
router.route('/public/free-check/:checkId').get(freeCheckController.status)
router.route('/public/free-check/:checkId/email').post(freeCheckController.sendCode)
router.route('/public/free-check/:checkId/verify').post(freeCheckController.verify)
router.route('/public/leads/unsubscribe').get(freeCheckController.unsubscribe)
```

- [ ] **Step 1: Failing API check** `backend/src/checks/freeCheckApi.check.ts` — drives the controller with fake `req`/`res` and the in-memory store:

```ts
/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/freeCheckApi.check.ts (needs the local Mongo)
import assert from 'assert'
import mongoose from 'mongoose'
import freeCheckController from '../controller/freeCheckController'
import freeCheckModel from '../model/freeCheckModel'
import leadModel from '../model/leadModel'
import { memoryStore, KEYS } from '../service/freeCheck/store'
import { hashIp } from '../service/freeCheck/helpers'
import { setSetting } from '../model/appSettingModel'

type Res = { code: number; body: { data?: Record<string, unknown>; message?: string } }
const call = (fn: (req: never, res: never, next: never) => unknown, body: object = {}, params: object = {}, ip = '9.9.9.9') =>
    new Promise<Res>((resolve) => {
        const res = { status(c: number) { this.c = c; return this }, json(b: Res['body']) { resolve({ code: (this as { c?: number }).c ?? 200, body: b }) }, c: 200, redirect() {}, send() {} }
        const next = (err: { status?: number; message?: string }) => resolve({ code: err?.status ?? 500, body: { message: err?.message } })
        fn({ body, params, query: {}, ip, headers: {}, method: 'POST', originalUrl: '/x' } as never, res as never, next as never)
    })

const run = async () => {
    await mongoose.connect('mongodb://127.0.0.1:27017/signal_freecheck_api_check')
    await mongoose.connection.dropDatabase()
    const sent: Array<{ to: string; subject: string; text: string }> = []
    const queued: Array<{ checkId: string; runAt?: Date }> = []
    Object.assign(freeCheckController.deps, {
        store: memoryStore(),
        turnstile: async (t?: string) => t !== 'bad',
        send: async (to: string[], subject: string, text: string) => void sent.push({ to: to[0], subject, text }),
        fetchHtml: async () => '<title>Buy Attar | Hasan Oud</title>',
        enqueue: async (checkId: string, runAt?: Date) => (queued.push({ checkId, runAt }), {}),
        categories: async () => ['Fragrances & Perfumes', 'Skincare']
    })
    const body = { url: 'https://hasanoud.com', brandName: 'Hasan Oud', category: 'Fragrances & Perfumes', questions: ['500 ke andar sabse accha attar', 'Best oud attar under ₹1000', 'Eid ke liye best attar konsa hai'], turnstileToken: 'ok', tz: 'Asia/Kolkata' }

    // site
    const site = await call(freeCheckController.site, { url: 'hasanoud.com' })
    assert.equal(site.code, 200)
    assert.equal(site.body.data!.brandName, 'Hasan Oud')
    assert.equal(site.body.data!.category, 'Fragrances & Perfumes')
    assert.ok((site.body.data!.questions as unknown[]).length >= 7)
    assert.equal((await call(freeCheckController.site, { url: 'http://localhost' })).code, 400)

    // create: validation, turnstile, queued
    assert.equal((await call(freeCheckController.create, { ...body, questions: body.questions.slice(0, 2) })).code, 400)
    assert.equal((await call(freeCheckController.create, { ...body, questions: [...body.questions.slice(0, 2), 'write my essay'] })).code, 400) // not from the list
    assert.equal((await call(freeCheckController.create, { ...body, turnstileToken: 'bad' })).code, 403)
    const c1 = await call(freeCheckController.create, body)
    assert.equal(c1.code, 201)
    const id1 = c1.body.data!.checkId as string
    assert.equal(queued.length, 1)

    // same ip + domain, other questions → same check, nothing queued
    const again = await call(freeCheckController.create, { ...body, questions: body.questions.slice().reverse() })
    assert.equal(again.body.data!.checkId, id1)
    assert.equal(queued.length, 1)

    // ip limit 3/day (two more domains, then refused)
    await call(freeCheckController.create, { ...body, url: 'https://a1.com' })
    await call(freeCheckController.create, { ...body, url: 'https://a2.com' })
    assert.equal((await call(freeCheckController.create, { ...body, url: 'https://a3.com' })).code, 429)

    // status: half result has no names
    await freeCheckModel.updateOne({ checkId: id1 }, { $set: { status: 'done', questions: body.questions.map((text) => ({ text, answers: [
        { engine: 'ChatGPT', ok: true, named: false, position: null, brands: ['Ajmal'] },
        { engine: 'Gemini', ok: true, named: false, position: null, brands: ['Ajmal'] }] })) } })
    const st = await call(freeCheckController.status, {}, { checkId: id1 })
    assert.equal(st.code, 200)
    assert.ok(!JSON.stringify(st.body).includes('Ajmal'))
    assert.equal((await call(freeCheckController.status, {}, { checkId: 'nope' })).code, 404)

    // email: disposable refused; code sent; wrong code counts; right code unlocks names, saves lead, sends report, clears cache
    assert.equal((await call(freeCheckController.sendCode, { email: 'x@mailinator.com' }, { checkId: id1 })).code, 400)
    assert.equal((await call(freeCheckController.sendCode, { email: 'Owner@HasanOud.com', marketingConsent: true }, { checkId: id1 })).code, 200)
    const code = sent.at(-1)!.text.match(/\b\d{6}\b/)![0]
    assert.equal((await call(freeCheckController.verify, { code: '000000' === code ? '111111' : '000000' }, { checkId: id1 })).code, 400)
    const ok = await call(freeCheckController.verify, { code }, { checkId: id1 })
    assert.equal(ok.code, 200)
    assert.deepEqual(ok.body.data!.otherBrands, [{ name: 'Ajmal', count: 6 }])
    const lead = await leadModel.findOne({ email: 'owner@hasanoud.com' }).lean()
    assert.equal(lead!.marketingConsent, true)
    assert.equal(lead!.country, 'IN')
    assert.ok(sent.some((m) => m.subject.includes('Hasan Oud on ChatGPT and Gemini')))
    // after verify the ip+domain cache entry is gone, so a verified visitor can run fresh questions
    assert.equal(await freeCheckController.deps.store!.get(KEYS.cache(hashIp('9.9.9.9'), 'hasanoud.com')), null)
    // status of a verified check exposes email/url/category for the signup page
    assert.equal((await call(freeCheckController.status, {}, { checkId: id1 })).body.data!.email, 'owner@hasanoud.com')

    // 5 wrong codes → locked
    const c2 = (await call(freeCheckController.create, { ...body, url: 'https://b1.com' }, {}, '7.7.7.7')).body.data!.checkId as string
    await call(freeCheckController.sendCode, { email: 'b@b1.com' }, { checkId: c2 }, '7.7.7.7')
    for (let i = 0; i < 5; i++) await call(freeCheckController.verify, { code: 'abcdef' }, { checkId: c2 })
    assert.equal((await call(freeCheckController.verify, { code: sent.at(-1)!.text.match(/\b\d{6}\b/)![0] }, { checkId: c2 })).code, 429)

    // global budget reached → waiting-email; after verify → scheduled for next morning
    await setSetting('freeCheckDailyLimit', 0)
    const w = await call(freeCheckController.create, { ...body, url: 'https://c1.com' }, {}, '6.6.6.6')
    assert.equal(w.body.data!.status, 'waiting-email')
    const before = queued.length
    await call(freeCheckController.sendCode, { email: 'c@c1.com' }, { checkId: w.body.data!.checkId }, '6.6.6.6')
    const v = await call(freeCheckController.verify, { code: sent.at(-1)!.text.match(/\b\d{6}\b/)![0] }, { checkId: w.body.data!.checkId })
    assert.equal(v.body.data!.status, 'scheduled')
    assert.equal(queued.length, before + 1)
    assert.ok(queued.at(-1)!.runAt! > new Date())

    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
    console.log('freeCheckApi checks passed')
    process.exit(0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
```

- [ ] **Step 2: Run — expect FAIL** (controller missing).

- [ ] **Step 3: Joi schemas** in `validationService.ts`:

```ts
export const validationFreeCheckSite = Joi.object({ url: Joi.string().trim().max(300).required() })
export const validationFreeCheckCreate = Joi.object({
    url: Joi.string().trim().max(300).required(),
    brandName: Joi.string().trim().min(2).max(80).required(),
    category: Joi.string().trim().max(80).required(),
    questions: Joi.array().items(Joi.string().trim().max(200)).length(3).unique().required(),
    turnstileToken: Joi.string().allow('').max(2048),
    tz: Joi.string().allow('').max(64)
})
export const validationFreeCheckEmail = Joi.object({ email: Joi.string().trim().max(254).required(), marketingConsent: Joi.boolean().default(false) })
export const validationFreeCheckVerify = Joi.object({ code: Joi.string().trim().length(6).required() })
```

- [ ] **Step 4: Controller** `backend/src/controller/freeCheckController.ts`:

```ts
import { NextFunction, Request, Response } from 'express'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import config from '../config/config'
import emailService from '../service/emailService'
import { fetchPublicText } from '../util/publicUrl'
import categoryModel from '../model/categoryModel'
import freeCheckModel from '../model/freeCheckModel'
import leadModel from '../model/leadModel'
import { getSetting } from '../model/appSettingModel'
import { freeCheckQuestions } from '../service/querySuggestionService'
import { enqueueFreeCheckJob } from '../service/queueService'
import { verifyTurnstile } from '../service/freeCheck/turnstile'
import { otpEmail, reportEmail, verifyLeadUnsubscribe } from '../service/freeCheck/emails'
import { KEYS, consume, redisStore, type IFreeCheckStore } from '../service/freeCheck/store'
import {
    countryFromTz, fullResult, halfResult, hashIp, hashOtp, isDisposableEmail, istDay, newCheckId, newOtp, nextMorningIst, normaliseEmail,
    normaliseSiteUrl, siteFacts
} from '../service/freeCheck/helpers'
import {
    validateJoiSchema, validationFreeCheckCreate, validationFreeCheckEmail, validationFreeCheckSite, validationFreeCheckVerify
} from '../service/validationService'
import logger from '../util/loger'

const LIMITS = { ipChecks: 3, ipSites: 10, ipCodes: 5, emailCodes: 3, emailChecks: 2 }
const CACHE_TTL = 24 * 60 * 60
const fail = (next: NextFunction, req: Request, status: number, message: string) => httpError(next, new Error(message), req, status)

const deps = {
    store: null as IFreeCheckStore | null,
    turnstile: verifyTurnstile as (token: string | undefined, ip: string) => Promise<boolean>,
    send: (to: string[], subject: string, text: string, html?: string) => emailService.sendEmail(to, subject, text, { html }),
    fetchHtml: (url: string) => fetchPublicText(url, { 'User-Agent': 'Mozilla/5.0 (compatible; SignalBot/1.0)' }, 8000),
    enqueue: enqueueFreeCheckJob as (checkId: string, runAt?: Date) => Promise<unknown>,
    categories: async () => (await categoryModel.find({ isActive: true }).select('name').lean()).map((c) => c.name),
    now: () => new Date()
}
const store = () => (deps.store ??= redisStore())
const ipOf = (req: Request) => hashIp(req.ip || '')

const alertIfBusy = async (used: number, limit: number) => {
    const to = process.env.FREE_CHECK_ALERT_EMAIL
    if (!to || used < Math.ceil(limit * 0.8)) return
    if (!(await store().setOnce(KEYS.alert + istDay(deps.now()), 26 * 60 * 60))) return
    await deps.send([to], `Free checker: ${used} of ${limit} checks used today`, 'Raise the limit on Admin → Free checker if this is real traffic.').catch(() => undefined)
}

export default {
    deps,

    site: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { error, value } = validateJoiSchema<{ url: string }>(validationFreeCheckSite, req.body)
            const site = !error && normaliseSiteUrl(value.url)
            if (!site) return fail(next, req, 400, 'Enter your full website address, like https://yourstore.com')
            if (!(await consume(store(), KEYS.ipSites(ipOf(req)), LIMITS.ipSites, istDay(deps.now())))) return fail(next, req, 429, "Today's free lookups are used up. Try again tomorrow.")
            const categories = await deps.categories()
            const html = await deps.fetchHtml(site.url).catch(() => '')
            const facts = siteFacts(html, categories)
            httpResponse(req, res, 200, 'OK', { ...site, ...facts, categories, questions: facts.category ? freeCheckQuestions(facts.category) : [] })
        } catch (err) {
            httpError(next, err, req, 500)
        }
    },

    create: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { error, value } = validateJoiSchema<{ url: string; brandName: string; category: string; questions: string[]; turnstileToken?: string; tz?: string }>(validationFreeCheckCreate, req.body)
            const site = !error && normaliseSiteUrl(value.url)
            if (!site) return fail(next, req, 400, 'Check the website, brand name and pick exactly 3 questions.')
            const allowed = new Set(freeCheckQuestions(value.category).map((q) => q.text))
            if (!(await deps.categories()).includes(value.category) || !value.questions.every((q) => allowed.has(q))) return fail(next, req, 400, 'Pick 3 questions from the list.')
            if (!(await deps.turnstile(value.turnstileToken, req.ip || ''))) return fail(next, req, 403, 'Verification failed. Refresh the page and try again.')

            const ip = ipOf(req)
            const cached = await store().get(KEYS.cache(ip, site.domain))
            if (cached && (await freeCheckModel.exists({ checkId: cached }))) {
                const c = await freeCheckModel.findOne({ checkId: cached }).select('status').lean()
                return httpResponse(req, res, 200, 'OK', { checkId: cached, status: c!.status })
            }
            const day = istDay(deps.now())
            if (!(await consume(store(), KEYS.ipChecks(ip), LIMITS.ipChecks, day))) return fail(next, req, 429, "Today's 3 free checks are used. Sign up, or come back tomorrow.")

            const limit = await getSetting('freeCheckDailyLimit', 150)
            const withinBudget = await consume(store(), KEYS.global, limit, day)
            const checkId = newCheckId()
            await freeCheckModel.create({
                checkId, url: site.url, domain: site.domain, brandName: value.brandName, category: value.category, market: 'IN',
                questions: value.questions.map((text) => ({ text, answers: [] })), ipHash: ip, country: countryFromTz(value.tz || ''),
                status: withinBudget ? 'queued' : 'waiting-email'
            })
            await store().set(KEYS.cache(ip, site.domain), checkId, CACHE_TTL)
            if (withinBudget) {
                await deps.enqueue(checkId)
                const used = Number((await store().get(KEYS.global + day)) || 0)
                void alertIfBusy(used, limit)
            }
            httpResponse(req, res, 201, 'OK', { checkId, status: withinBudget ? 'queued' : 'waiting-email' })
        } catch (err) {
            httpError(next, err, req, 500)
        }
    },

    status: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const check = await freeCheckModel.findOne({ checkId: String(req.params.checkId) }).lean()
            if (!check) return fail(next, req, 404, 'Check not found')
            const verified = check.verifiedAt ? { email: check.email, url: check.url, category: check.category, verified: true } : { verified: false }
            httpResponse(req, res, 200, 'OK', { ...halfResult(check), ...verified })
        } catch (err) {
            httpError(next, err, req, 500)
        }
    },

    sendCode: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { error, value } = validateJoiSchema<{ email: string; marketingConsent: boolean }>(validationFreeCheckEmail, req.body)
            const email = !error && normaliseEmail(value.email)
            if (!email) return fail(next, req, 400, 'Enter a valid email address.')
            if (isDisposableEmail(email)) return fail(next, req, 400, 'Please use your work or personal email, not a temporary one.')
            const check = await freeCheckModel.findOne({ checkId: String(req.params.checkId) })
            if (!check) return fail(next, req, 404, 'Check not found')
            const day = istDay(deps.now())
            if (!(await consume(store(), KEYS.ipCodes(ipOf(req)), LIMITS.ipCodes, day)) || !(await consume(store(), KEYS.emailCodes(email), LIMITS.emailCodes, day)))
                return fail(next, req, 429, 'Too many codes today. Try again tomorrow.')
            const code = newOtp()
            await freeCheckModel.updateOne(
                { checkId: check.checkId },
                { $set: { email, otpHash: hashOtp(code, check.checkId), otpExpiresAt: new Date(deps.now().getTime() + 10 * 60 * 1000), otpAttempts: 0, consentRequested: value.marketingConsent } }
            )
            const mail = otpEmail(code)
            await deps.send([email], mail.subject, mail.text, mail.html)
            httpResponse(req, res, 200, 'OK', { sent: true })
        } catch (err) {
            httpError(next, err, req, 500)
        }
    },

    verify: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { error, value } = validateJoiSchema<{ code: string }>(validationFreeCheckVerify, req.body)
            const check = await freeCheckModel.findOne({ checkId: String(req.params.checkId) })
            if (!check || !check.email) return fail(next, req, 404, 'Check not found')
            if (check.otpAttempts >= 5) return fail(next, req, 429, 'Too many tries. Ask for a new code.')
            const valid = !error && check.otpHash && check.otpExpiresAt && check.otpExpiresAt > deps.now() && check.otpHash === hashOtp(value.code, check.checkId)
            if (!valid) {
                await freeCheckModel.updateOne({ checkId: check.checkId }, { $inc: { otpAttempts: 1 } })
                return fail(next, req, 400, 'Wrong or expired code. Ask for a new one.')
            }
            const now = deps.now()
            const consent = Boolean(check.consentRequested)
            const scheduled = check.status === 'waiting-email'
            // One email unlocks at most 2 checks a day, whichever way they ran
            if (!(await consume(store(), KEYS.emailChecks(check.email), LIMITS.emailChecks, istDay(now)))) return fail(next, req, 429, 'This email has used its free checks today.')
            if (scheduled) await deps.enqueue(check.checkId, nextMorningIst(now))
            await freeCheckModel.updateOne(
                { checkId: check.checkId },
                { $set: { verifiedAt: now, otpHash: null, otpExpiresAt: null, ...(scheduled ? { status: 'scheduled' } : {}) } }
            )
            await leadModel.updateOne(
                { email: check.email },
                {
                    $set: { domain: check.domain, brandName: check.brandName, category: check.category, market: check.market, country: check.country, verifiedAt: now, ...(consent ? { marketingConsent: true, consentAt: now } : {}) },
                    $addToSet: { checkIds: check.checkId }
                },
                { upsert: true }
            )
            await store().del(KEYS.cache(check.ipHash, check.domain))
            const fresh = (await freeCheckModel.findOne({ checkId: check.checkId }).lean())!
            if (fresh.status === 'done') {
                const mail = reportEmail(fresh, check.email, consent)
                await deps.send([check.email], mail.subject, mail.text, mail.html).catch((e) => logger.warn('[freeCheck] report email failed', { meta: e }))
            }
            httpResponse(req, res, 200, 'OK', fresh.status === 'done' ? fullResult(fresh) : { ...halfResult(fresh), status: fresh.status })
        } catch (err) {
            httpError(next, err, req, 500)
        }
    },

    unsubscribe: async (req: Request, res: Response) => {
        const email = String(req.query.e || '').toLowerCase()
        if (email && verifyLeadUnsubscribe(email, String(req.query.t || ''))) await leadModel.updateOne({ email }, { $set: { marketingConsent: false } })
        res.status(200).send('You will not get tips and updates from Signal any more.')
    }
}
```

Add `consentRequested: { type: Boolean, default: false }` to `freeCheckSchema` and `consentRequested?: boolean` to `IFreeCheck`.

**Report for a scheduled check** — in `runFreeCheck.ts` add `send?: (to: string[], subject: string, text: string, html?: string) => Promise<unknown>` to `IDeps`, import `reportEmail` from `./emails` and `emailService`, and replace the line `await freeCheckModel.updateOne({ checkId }, { $set: { questions, status } })` with:

```ts
        await freeCheckModel.updateOne({ checkId }, { $set: { questions, status } })
        // A check that ran the next morning was verified already: its report goes out now
        if (status === 'done' && check.verifiedAt && check.email) {
            const send = deps.send ?? ((to, s, t, h) => emailService.sendEmail(to, s, t, { html: h }))
            const done = (await freeCheckModel.findOne({ checkId }).lean())!
            const mail = reportEmail(done, check.email, Boolean(check.consentRequested))
            await send([check.email], mail.subject, mail.text, mail.html).catch((e) => logger.warn('[freeCheck] report email failed', { meta: e }))
        }
```

and add to `freeCheckRun.check.ts` (before cleanup):

```ts
    // A verified, scheduled check emails its report when it finishes; an unverified one does not
    const mails: string[] = []
    const send = async (to: string[]) => void mails.push(to[0])
    await freeCheckModel.create({ ...base('sched1'), status: 'scheduled', email: 'o@hasanoud.com', verifiedAt: new Date() })
    await runFreeCheck('sched1', { ask, extract: extract as never, store: memoryStore(), send })
    await freeCheckModel.create(base('plain1'))
    await runFreeCheck('plain1', { ask, extract: extract as never, store: memoryStore(), send })
    assert.deepEqual(mails, ['o@hasanoud.com'])
```

- [ ] **Step 5: CORS + routes + config**

`config.ts`: `WEBSITE_URL: process.env.WEBSITE_URL || ''` (prod `https://geosignalai.com`, staging `https://staging.geosignalai.com`).

`app.ts` — the public free-check routes accept the website origin; add before the existing `cors(...)`:

```ts
// The marketing website calls the public free checker from its own origin; nothing else is opened
const websiteOrigins = [config.WEBSITE_URL, config.WEBSITE_URL && config.WEBSITE_URL.replace('://', '://www.')].filter(Boolean) as string[]
app.use('/api/v1/public', cors({ origin: websiteOrigins.length ? websiteOrigins : true, methods: ['GET', 'POST', 'OPTIONS'], credentials: false }))
```

`apiRouter.ts` — the six routes above, near the reports unsubscribe route. `.env.example` + `docker-compose.yml` (`api` and `worker` env): `WEBSITE_URL`, `TURNSTILE_SECRET_KEY`, `FREE_CHECK_SALT`, `FREE_CHECK_ALERT_EMAIL` (empty by default — the user chooses the address).

- [ ] **Step 6: Run the three checks — expect PASS**; tsc; eslint; prettier on changed files.

- [ ] **Step 7: Commit** — `git commit -m "feat(free-check): public api with limits, cache and email codes"`.

---

### Task 7: Admin — limit, leads, funnel

**Files:**
- Modify: `backend/src/controller/adminController.ts`, `backend/src/router/apiRouter.ts`
- Create: `frontend/src/pages/admin/AdminFreeChecker.tsx`
- Modify: `frontend/src/router.tsx`, `frontend/src/components/AdminLayout.tsx`
- Test: `backend/src/checks/freeCheckApi.check.ts`

**Interfaces:**
- Produces: `GET /admin/free-check` → `{ today: { used, limit }, funnel: { checks, verified, signups } (7 days), leads: ILead[] (latest 200) }`; `PUT /admin/free-check` `{ limit: number (0–5000) }`; `GET /admin/free-check/leads.csv`.

- [ ] **Step 1: Failing assertions** at the end of `freeCheckApi.check.ts` (before cleanup):

```ts
import adminController from '../controller/adminController'
```

```ts
    const adm = await call(adminController.getFreeCheck as never)
    assert.equal(adm.code, 200)
    assert.ok((adm.body.data!.leads as unknown[]).length >= 1)
    assert.equal((await call(adminController.setFreeCheckLimit as never, { limit: -1 })).code, 400)
    assert.equal((await call(adminController.setFreeCheckLimit as never, { limit: 300 })).code, 200)
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** in `adminController.ts`:

```ts
    getFreeCheck: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            const day = istDay()
            const [limit, used, checks, verified, signups, leads] = await Promise.all([
                getSetting('freeCheckDailyLimit', 150),
                redisStore().get(KEYS.global + day).catch(() => '0'),
                freeCheckModel.countDocuments({ createdAt: { $gte: since } }),
                freeCheckModel.countDocuments({ createdAt: { $gte: since }, verifiedAt: { $ne: null } }),
                leadModel.countDocuments({ signedUpAt: { $gte: since } }),
                leadModel.find().sort({ createdAt: -1 }).limit(200).lean()
            ])
            httpResponse(req, res, 200, responceseMessage.SUCCESS, { today: { used: Number(used || 0), limit }, funnel: { checks, verified, signups }, leads })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    setFreeCheckLimit: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const limit = Number((req.body as { limit?: unknown }).limit)
            if (!Number.isInteger(limit) || limit < 0 || limit > 5000) return httpError(next, new Error('Limit must be 0–5000'), req, 400)
            await setSetting('freeCheckDailyLimit', limit)
            httpResponse(req, res, 200, responceseMessage.SUCCESS, { limit })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    getFreeCheckLeadsCsv: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const leads = await leadModel.find().sort({ createdAt: -1 }).lean()
            const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
            const rows = leads.map((l) => [l.email, l.domain, l.brandName, l.category, l.country, l.marketingConsent, l.verifiedAt?.toISOString(), l.signedUpAt?.toISOString() ?? '', l.createdAt?.toISOString()].map(cell).join(','))
            res.setHeader('Content-Type', 'text/csv; charset=utf-8')
            res.setHeader('Content-Disposition', 'attachment; filename="free-check-leads.csv"')
            res.send(['email,site,brand,category,country,consent,verified,signed_up,created', ...rows].join('\n'))
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },
```

Routes (with the other admin routes):

```ts
router.route('/admin/free-check').get(authentication, adminOnly, adminController.getFreeCheck).put(authentication, adminOnly, adminController.setFreeCheckLimit)
router.route('/admin/free-check/leads.csv').get(authentication, adminOnly, adminController.getFreeCheckLeadsCsv)
```

`frontend/src/pages/admin/AdminFreeChecker.tsx` — follow `AdminCostLogs.tsx` (same `api` client, `panel` classes):

```tsx
import { useEffect, useState } from 'react';
import api from '../../services/api';

interface Lead { email: string; domain: string; brandName: string; category: string; country: string; marketingConsent: boolean; signedUpAt: string | null; createdAt: string }
interface Data { today: { used: number; limit: number }; funnel: { checks: number; verified: number; signups: number }; leads: Lead[] }

export default function AdminFreeChecker() {
  const [data, setData] = useState<Data | null>(null);
  const [limit, setLimit] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => api.get('/admin/free-check').then((r) => { setData(r.data.data); setLimit(String(r.data.data.today.limit)); });
  useEffect(() => { void load(); }, []);

  const save = async () => {
    try { await api.put('/admin/free-check', { limit: Number(limit) }); setMsg('Saved'); void load(); }
    catch { setMsg('Limit must be 0–5000'); }
  };
  const csv = async () => {
    const r = await api.get('/admin/free-check/leads.csv', { responseType: 'blob' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(r.data); a.download = 'free-check-leads.csv'; a.click();
  };
  if (!data) return <div className="panel">Loading…</div>;
  return (
    <div>
      <div className="panel">
        <h3>Free checker today</h3>
        <p className="sub">{data.today.used} of {data.today.limit} checks used (IST day)</p>
        <label>Daily limit <input type="number" min={0} max={5000} value={limit} onChange={(e) => setLimit(e.target.value)} /></label>
        <button onClick={save}>Save</button> {msg}
      </div>
      <div className="panel">
        <h3>Last 7 days</h3>
        <p>{data.funnel.checks} checks → {data.funnel.verified} emails verified → {data.funnel.signups} signups</p>
      </div>
      <div className="panel">
        <h3>Leads <button onClick={csv}>Download CSV</button></h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Email</th><th>Site</th><th>Category</th><th>Country</th><th>Consent</th><th>Signed up</th><th>Date</th></tr></thead>
            <tbody>
              {data.leads.map((l) => (
                <tr key={l.email}>
                  <td>{l.email}</td><td>{l.domain}</td><td>{l.category}</td><td>{l.country || '—'}</td>
                  <td>{l.marketingConsent ? 'yes' : 'no'}</td><td>{l.signedUpAt ? new Date(l.signedUpAt).toLocaleDateString() : '—'}</td>
                  <td>{new Date(l.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

(Check the `api` import path used by `AdminCostLogs.tsx` and match it.) Router: add `{ path: 'free-checker', element: <AdminFreeChecker /> }` next to `cost-logs`; nav: `{ path: '/admin/free-checker', label: 'Free checker', icon: '🔎' }` in `AdminLayout.tsx`.

- [ ] **Step 4: Run backend checks — PASS**; frontend `npx tsc --noEmit -p tsconfig.app.json`, `npm run lint`, `npm run build`.

- [ ] **Step 5: Commit** — `git commit -m "feat(free-check): admin limit, leads and funnel"`.

---

### Task 8: Signup and onboarding handoff

**Files:**
- Modify: `frontend/src/pages/Signup.tsx`, `frontend/src/pages/Onboarding.tsx`
- Create: `frontend/src/utils/freeCheckHandoff.ts`
- Modify: `backend/src/controller/userController.ts` (register: mark lead)
- Test: `backend/src/checks/freeCheckApi.check.ts` (lead marked on register is covered by a direct `leadModel` assertion on the helper below)

**Interfaces:**
- Produces: `markLeadSignedUp(email: string): Promise<void>` (backend, in `service/freeCheck/lead.ts`); frontend `saveFreeCheckId(id)`, `loadFreeCheck(): Promise<{ email: string; url: string; brandName: string; category: string; questions: string[] } | null>`, `clearFreeCheck()`.

- [ ] **Step 1: Backend failing assertion** (in `freeCheckApi.check.ts`):

```ts
import { markLeadSignedUp } from '../service/freeCheck/lead'
```

```ts
    await markLeadSignedUp('OWNER@hasanoud.com')
    assert.ok((await leadModel.findOne({ email: 'owner@hasanoud.com' }).lean())!.signedUpAt)
    await markLeadSignedUp('nobody@x.com') // no lead: no error, nothing created
    assert.equal(await leadModel.countDocuments({ email: 'nobody@x.com' }), 0)
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement** `backend/src/service/freeCheck/lead.ts`:

```ts
import leadModel from '../../model/leadModel'

// A lead that becomes an account; never creates a lead
export const markLeadSignedUp = async (email: string) => {
    await leadModel.updateOne({ email: email.trim().toLowerCase(), signedUpAt: null }, { $set: { signedUpAt: new Date() } })
}
```

In `userController.register`, right after `const newUser = await databseService.registerUser(payload)`:

```ts
            await markLeadSignedUp(newUser.email).catch(() => undefined)
```

- [ ] **Step 4: Frontend** `frontend/src/utils/freeCheckHandoff.ts`:

```ts
import api from '../services/api';

const KEY = 'signal.freeCheckId';

// The free check survives signup → email confirmation → login, so onboarding can pre-fill it
export const saveFreeCheckId = (id: string) => { try { localStorage.setItem(KEY, id); } catch { /* storage blocked */ } };
export const clearFreeCheck = () => { try { localStorage.removeItem(KEY); } catch { /* storage blocked */ } };

export async function loadFreeCheck() {
  let id: string | null = null;
  try { id = localStorage.getItem(KEY); } catch { return null; }
  if (!id) return null;
  try {
    const d = (await api.get(`/public/free-check/${encodeURIComponent(id)}`)).data.data;
    if (!d.verified) return null;
    return { email: d.email as string, url: d.url as string, brandName: d.brandName as string, category: d.category as string, questions: (d.questions as Array<{ text: string }>).map((q) => q.text) };
  } catch { return null; }
}
```

`Signup.tsx`: on mount, read `fc` from `new URLSearchParams(window.location.search)`; if present `saveFreeCheckId(fc)` and `loadFreeCheck().then((f) => f && setValue('email', f.email))` (use `setValue` from the existing `useForm`).

`Onboarding.tsx`: add a ref `const freeCheck = useRef<Awaited<ReturnType<typeof loadFreeCheck>>>(null);`. In a mount effect: `loadFreeCheck().then((f) => { if (!f) return; freeCheck.current = f; setWebsite(f.url); setBrandName(f.brandName); setCategory(f.category); })`. In `loadTemplates`, after `toQueryItems(items)`, when `freeCheck.current` is set, tick exactly its questions:

```ts
      const fc = freeCheck.current;
      const list = toQueryItems(items).map((q) => (fc ? { ...q, enabled: fc.questions.includes(q.text) } : q));
      if (!cancelled()) setQueries(queriesWithinPlan(list));
```

After the brand is created successfully (where onboarding finishes), call `clearFreeCheck()`.

- [ ] **Step 5: Run backend check — PASS; frontend tsc/lint/build pass.**

- [ ] **Step 6: Commit** — `git commit -m "feat(free-check): signup and onboarding pick up the free check"`.

---

### Task 9: Website page

**Files:**
- Create: `website/src/pages/free-ai-visibility-check.astro`
- Modify: `website/src/pages/index.astro` (CTA under the demo), `website/src/components/Header.astro` (nav link "Free check"), `.github/workflows/images.yml` (website build arg `PUBLIC_TURNSTILE_SITE_KEY` from repo vars `TURNSTILE_SITE_KEY` / `STAGING_TURNSTILE_SITE_KEY`), `website/Dockerfile` (`ARG PUBLIC_TURNSTILE_SITE_KEY` + `ENV`)

**Interfaces:**
- Consumes: the public API (Task 6), `APP_URL` from `website/src/config/site.ts`.

- [ ] **Step 1: The page.** `free-ai-visibility-check.astro` uses `Base` layout, the site's tokens (`--ink`, `--porcelain`, amber `#FFC857` marker), and one `<script>` (Astro bundles it). Structure (ids used by the script):

```astro
---
import Base from '../layouts/Base.astro'
import { APP_URL } from '../config/site'
const siteKey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY || ''
---
<Base title="Free AI visibility check — is ChatGPT recommending your brand?" description="Enter your store, pick 3 buyer questions, and see which brands ChatGPT and Gemini recommend instead of you. Free, for Indian D2C brands.">
  <section class="fc" data-api={`${APP_URL}/api/v1/public`} data-app={APP_URL} data-sitekey={siteKey}>
    <h1>Is AI recommending your brand — or someone else?</h1>
    <p class="lede">For Indian D2C brands. 3 buyer questions, asked to ChatGPT and Gemini. Free.</p>

    <form id="fc-site">
      <label>Your website <input id="fc-url" type="url" placeholder="https://hasanoud.com" required /></label>
      <button>Check karo</button>
      <p class="err" id="fc-site-err" hidden></p>
    </form>

    <form id="fc-questions" hidden>
      <label>Brand name <input id="fc-brand" required minlength="2" maxlength="80" /></label>
      <label>Category <input id="fc-category" list="fc-categories" required /><datalist id="fc-categories"></datalist></label>
      <fieldset><legend>Pick 3 questions</legend><div id="fc-list"></div></fieldset>
      <div id="fc-turnstile"></div>
      <button id="fc-run">ChatGPT aur Gemini se poochho</button>
      <p class="err" id="fc-run-err" hidden></p>
    </form>

    <div id="fc-wait" hidden><p id="fc-wait-text">ChatGPT se poochh rahe hain…</p></div>

    <div id="fc-result" hidden>
      <p class="big" id="fc-score"></p>
      <ul id="fc-rows"></ul>
      <p id="fc-others"></p>
    </div>

    <form id="fc-email" hidden>
      <p id="fc-email-lead">Kaun aapki jagah aa raha hai? Email daalo — naam abhi dikhenge, report inbox me.</p>
      <label>Email <input id="fc-mail" type="email" required /></label>
      <label class="check"><input id="fc-consent" type="checkbox" /> Mujhe AI visibility ke tips aur updates bhejo</label>
      <button>Code bhejo</button>
      <p class="err" id="fc-email-err" hidden></p>
    </form>

    <form id="fc-code" hidden>
      <label>6-digit code <input id="fc-otp" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required /></label>
      <button>Naam dikhao</button>
      <p class="err" id="fc-code-err" hidden></p>
    </form>

    <div id="fc-full" hidden>
      <p id="fc-instead"></p>
      <p>AI recommends brands it has read about in many places — reviews, lists and comparison pages.</p>
      <a id="fc-signup" class="cta">Track 15 questions × 5 AIs every week → Free account banao</a>
    </div>
  </section>
  {siteKey && <script is:inline src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>}
</Base>

<script>
  const root = document.querySelector<HTMLElement>('.fc')!
  const API = root.dataset.api!, APP = root.dataset.app!, SITEKEY = root.dataset.sitekey || ''
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
  const show = (id: string, on = true) => ($(id).hidden = !on)
  const err = (id: string, msg = '') => { $(id).textContent = msg; show(id, !!msg) }
  const post = async (path: string, body: object) => {
    const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.message || 'Something went wrong. Try again.')
    return j.data
  }
  let checkId = '', token = '', widget: unknown = null
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

  $('fc-url').addEventListener('blur', (e) => {
    const i = e.target as HTMLInputElement
    if (i.value && !/^https?:\/\//i.test(i.value)) i.value = `https://${i.value.trim()}`
  })

  $('fc-site').addEventListener('submit', async (e) => {
    e.preventDefault(); err('fc-site-err')
    try {
      const d = await post('/free-check/site', { url: $<HTMLInputElement>('fc-url').value })
      $<HTMLInputElement>('fc-url').value = d.url
      $<HTMLInputElement>('fc-brand').value = d.brandName
      $<HTMLInputElement>('fc-category').value = d.category
      $('fc-categories').innerHTML = d.categories.map((c: string) => `<option value="${esc(c)}">`).join('')
      renderQuestions(d.questions)
      show('fc-questions')
      // @ts-expect-error turnstile global
      if (SITEKEY && window.turnstile && !widget) widget = window.turnstile.render('#fc-turnstile', { sitekey: SITEKEY, callback: (t: string) => (token = t) })
    } catch (x) { err('fc-site-err', (x as Error).message) }
  })

  $('fc-category').addEventListener('change', async () => {
    // A changed category gets its own questions (same endpoint; brand and URL stay)
    try { renderQuestions((await post('/free-check/site', { url: $<HTMLInputElement>('fc-url').value, category: $<HTMLInputElement>('fc-category').value })).questions) } catch { /* keep the list */ }
  })

  function renderQuestions(qs: Array<{ text: string; lang: string }>) {
    $('fc-list').innerHTML = qs.map((q, i) => `<label class="q"><input type="checkbox" value="${esc(q.text)}" ${i < 3 ? 'checked' : ''}/> <span class="tag">${q.lang === 'EN' ? 'EN' : 'Hinglish'}</span> ${esc(q.text)}</label>`).join('')
  }

  $('fc-questions').addEventListener('submit', async (e) => {
    e.preventDefault(); err('fc-run-err')
    const questions = [...$('fc-list').querySelectorAll<HTMLInputElement>('input:checked')].map((i) => i.value)
    if (questions.length !== 3) return err('fc-run-err', 'Exactly 3 questions chuno.')
    try {
      const d = await post('/free-check', {
        url: $<HTMLInputElement>('fc-url').value, brandName: $<HTMLInputElement>('fc-brand').value, category: $<HTMLInputElement>('fc-category').value,
        questions, turnstileToken: token, tz: Intl.DateTimeFormat().resolvedOptions().timeZone
      })
      checkId = d.checkId
      show('fc-questions', false)
      if (d.status === 'waiting-email') {
        $('fc-email-lead').textContent = 'Aaj bheed zyada hai — email do, kal subah result bhej denge.'
        show('fc-email')
      } else poll()
    } catch (x) { err('fc-run-err', (x as Error).message) }
  })

  const steps = ['ChatGPT se poochh rahe hain…', 'Gemini se poochh rahe hain…', 'Jawab padh rahe hain…']
  async function poll() {
    show('fc-wait')
    for (let i = 0; i < 60; i++) {
      $('fc-wait-text').textContent = steps[Math.min(2, Math.floor(i / 4))]
      const r = await fetch(`${API}/free-check/${checkId}`).then((x) => x.json()).catch(() => null)
      const d = r?.data
      if (d && (d.status === 'done' || d.status === 'failed')) {
        show('fc-wait', false)
        if (d.status === 'failed') return err('fc-run-err', 'Abhi check nahi ho paya, 5 minute baad dobara karo.'), show('fc-questions')
        return renderHalf(d)
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
    show('fc-wait', false); err('fc-run-err', 'Is baar der lag rahi hai. Thodi der baad page refresh karo.'); show('fc-questions')
  }

  function renderHalf(d: { brandName: string; namedCount: number; total: number; otherBrandsCount: number; failedEngines: string[]; questions: Array<{ text: string; engines: Array<{ engine: string; ok: boolean; named: boolean; position: number | null }> }> }) {
    $('fc-score').textContent = `${d.total} me se ${d.namedCount} jawabon me ${d.brandName} ka naam aaya`
    $('fc-rows').innerHTML = d.questions.map((q) => `<li><b>${esc(q.text)}</b><br/>${q.engines.map((e) => `${e.engine} ${!e.ok ? '—' : e.named ? `✓${e.position ? ` #${e.position}` : ''}` : '✗'}`).join(' · ')}</li>`).join('')
    $('fc-others').innerHTML = `AI ne <b>${d.otherBrandsCount} aur brands</b> bataye: <span class="blur">Brand · Brand · Brand</span>${d.failedEngines.length ? `<br/><small>${d.failedEngines.join(', ')} ne jawab nahi diya.</small>` : ''}`
    show('fc-result'); if (d.otherBrandsCount) show('fc-email')
  }

  $('fc-email').addEventListener('submit', async (e) => {
    e.preventDefault(); err('fc-email-err')
    try {
      await post(`/free-check/${checkId}/email`, { email: $<HTMLInputElement>('fc-mail').value, marketingConsent: $<HTMLInputElement>('fc-consent').checked })
      show('fc-email', false); show('fc-code')
    } catch (x) { err('fc-email-err', (x as Error).message) }
  })

  $('fc-code').addEventListener('submit', async (e) => {
    e.preventDefault(); err('fc-code-err')
    try {
      const d = await post(`/free-check/${checkId}/verify`, { code: $<HTMLInputElement>('fc-otp').value })
      show('fc-code', false)
      $<HTMLAnchorElement>('fc-signup').href = `${APP}/signup?fc=${encodeURIComponent(checkId)}`
      $('fc-instead').innerHTML = d.status === 'scheduled'
        ? 'Ho gaya — kal subah result aapke inbox me aayega.'
        : d.otherBrands.length ? `AI aapki jagah ye bata raha hai: <b>${d.otherBrands.slice(0, 6).map((b: { name: string; count: number }) => `${esc(b.name)} (${b.count}/${d.total})`).join(', ')}</b>` : 'AI ne koi aur brand nahi bataya.'
      show('fc-full')
    } catch (x) { err('fc-code-err', (x as Error).message) }
  })
</script>

<style>
  .fc { max-width: 720px; margin: 0 auto; padding: clamp(24px, 5vw, 64px) 16px; display: grid; gap: 20px; }
  .fc form, .fc #fc-result, .fc #fc-full { display: grid; gap: 12px; }
  .fc [hidden] { display: none !important; }
  .fc input:not([type=checkbox]) { width: 100%; padding: 10px 12px; border: 1px solid #c9d1cf; border-radius: 8px; font: inherit; }
  .fc .q { display: flex; gap: 8px; align-items: baseline; }
  .fc .tag { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: #FFC857; color: var(--ink); }
  .fc .big { font-size: var(--t-2xl); font-weight: 700; }
  .fc .blur { filter: blur(5px); user-select: none; }
  .fc .err { color: #b3261e; }
  .fc .cta { display: inline-block; padding: 12px 18px; border-radius: 8px; background: var(--ink); color: var(--porcelain); text-decoration: none; }
</style>
```

The category-change call above posts `{ url, category }` to `/free-check/site`: extend the `site` route (Task 6) to accept an optional `category` that, when it is one of the active categories, overrides the guessed one (and add `category: Joi.string().trim().max(80)` to `validationFreeCheckSite`). Add one assertion for it to `freeCheckApi.check.ts`: `site` with `category: 'Skincare'` returns Skincare questions.

- [ ] **Step 2: CTA + nav.** `index.astro`: under the `AnswerTheatre` demo add `<a class="cta" href="/free-ai-visibility-check">Apna asli check karo →</a>`. `Header.astro`: nav link "Free check" → `/free-ai-visibility-check`.

- [ ] **Step 3: Build vars.** `website/Dockerfile` build stage: `ARG PUBLIC_TURNSTILE_SITE_KEY` and `ENV PUBLIC_TURNSTILE_SITE_KEY=$PUBLIC_TURNSTILE_SITE_KEY` next to the existing `PUBLIC_APP_URL`. `images.yml` website build args: `echo "PUBLIC_TURNSTILE_SITE_KEY=${{ vars[matrix.env == 'staging' && 'STAGING_TURNSTILE_SITE_KEY' || 'TURNSTILE_SITE_KEY'] }}"`.

- [ ] **Step 4: Verify.** `cd website && npm run build` passes; run the API locally (`backend`: `npm run dev` with local Mongo; Redis is not available locally, so test the page against **staging** after deploy instead) — locally confirm only that the page renders and the site step shows the API error state when the API is down.

- [ ] **Step 5: Commit** — `git commit -m "feat(free-check): website page with questions, result and email code"`.

---

### Task 10: Release to staging and Test Sheet

- [ ] **Step 1:** Push the branch, open the PR (title `feat: free AI visibility checker (#17)`), wait for checks, user merges.
- [ ] **Step 2: User tasks before deploy** (give the steps): Cloudflare account → Turnstile → add site `staging.geosignalai.com` and `geosignalai.com` (one widget with both hostnames, "Managed" mode) → copy site key and secret. GitHub repo variables `STAGING_TURNSTILE_SITE_KEY`, `TURNSTILE_SITE_KEY`; server `.env` on staging and prod: `TURNSTILE_SECRET_KEY`, `WEBSITE_URL` (`https://staging.geosignalai.com` / `https://geosignalai.com`), `FREE_CHECK_SALT` (`openssl rand -hex 32`), `FREE_CHECK_ALERT_EMAIL` (the user picks the address).
- [ ] **Step 3:** Rerun Images after the variables exist; Deploy to staging; seed nothing.
- [ ] **Step 4:** One real check on staging (6 calls) for `https://hasanoud.com`; verify with the user's test inbox; confirm `costLog` entries with `purpose: 'free-check'`, the report email, and the admin page.
- [ ] **Step 5:** Test Sheet feature **N13** + cases (+ve: full flow, cache on same site, signup pre-fill, admin limit change; −ve: 4th check same IP, disposable email, wrong code ×5, budget 0 → next-morning flow, 390px layout, CORS from another origin refused). Tester agent on staging; then production on the user's go-ahead (production needs the same env and variables).
