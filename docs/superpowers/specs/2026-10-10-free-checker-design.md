# Free AI Visibility Checker — design

Feature #17 in `COMPETITIVE-FEATURES.md`. Agreed in chat on 2026-10-10.

## Goal

A public lead magnet on the marketing website: a store owner enters their site, picks 3 buyer questions, and sees how ChatGPT and Gemini answer them — whether their brand is named, and **which brands are named instead**. The brand names unlock after a verified email; the report is emailed with a signup link that pre-fills onboarding.

Success: marketing plan Phase 2 (1,200 free checks/month) can start; every lead is a verified email; AI cost can never exceed the daily budget, whatever the traffic.

## Background

A free checker existed until 30 Sep 2026 (removed in `288d38e`): 3 template questions × 3 AIs = 9 calls per check, no per-IP limit or captcha, a score but no "who instead", optional email. It was costly, open to abuse and had a weak "aha". This design fixes all three.

## Decisions

| Topic | Decision |
|---|---|
| Where | Website only: `geosignalai.com/free-ai-visibility-check` (Astro page + client script). API on `app.geosignalai.com/api/v1/public/...`. The app's `/free-checker` route stays as is (→ `/signup`). |
| Input | Full site URL (`https://hasanoud.com`; a bare domain gets `https://` added). Brand name and category auto-filled from the homepage, editable. |
| Questions | The visitor ticks 3 from the category's list (EN + Hinglish, labelled). No free text. |
| AIs | ChatGPT + Gemini (the scan models): 3 × 2 = 6 calls per check, ≈ ₹0.25 before cache. |
| Execution | BullMQ job in the existing worker + polling. |
| Email | Half result free (counts only); brand names after email verified with a 6-digit code (OTP). |
| Market | India only (`market: 'IN'`); country stored on the lead for a later global decision. |
| Email series | Not in scope; only the one report email. Marketing consent is stored now. |

## 1. Visitor flow (website page)

1. **Site:** one field (placeholder `https://hasanoud.com`) + button "Check karo". `POST /public/free-check/site` reads the homepage and returns brand name, category and questions; if the page can't be read, the fields are empty and the visitor fills them.
2. **Questions:** brand name (editable), searchable category dropdown with examples ("Fragrances & Perfumes: attar, oud, deo"), the category's questions with **EN / Hinglish** labels, 3 strongest pre-ticked; exactly 3 must be ticked. Cloudflare Turnstile widget (mostly invisible). Button "ChatGPT aur Gemini se poochho".
3. **Waiting (10–30 s):** "ChatGPT se poochh rahe hain… Gemini se poochh rahe hain… jawab padh rahe hain…" while polling every 2 s.
4. **Half result:** "6 me se N jawabon me <brand> ka naam aaya"; per question ChatGPT ✓/✗ and Gemini ✓/✗ (with position when named); "AI ne K aur brands bataye" with blurred placeholders (no names are sent to the browser).
5. **Email:** "Kaun aapki jagah aa raha hai? Email daalo" + unticked checkbox "Mujhe AI visibility ke tips aur updates bhejo". A 6-digit code is emailed; the visitor types it on the same page; the names appear ("Ajmal 5/6, Al Haramain 4/6 …") with one line of advice, and the report email is sent.
6. **Signup CTA:** "Har hafte 15 sawaal × 5 AI pe nazar rakho → Free account banao" → `app.geosignalai.com/signup?fc=<checkId>`.

**Daily budget reached:** step 3 is replaced by "Aaj bheed zyada hai — email do, kal subah result bhej denge"; after the code is verified, the check is queued for 06:00 IST next day and the report is emailed when done.

## 2. API (no login; CORS allows only the website origin on `/public/*`)

| Route | Body | Does |
|---|---|---|
| `POST /public/free-check/site` | `{ url }` | Normalise URL; fetch homepage (`fetchPublicText`, SSRF-safe, 8 s); brand name from `og:site_name` / `<title>`; category by running the vertical rules (`querySuggestionService`) over title + meta description + first `<h1>`, mapped to an active category; returns `{ url, domain, brandName, category, questions[] }`. IP limit 10/day. No AI call. |
| `POST /public/free-check` | `{ url, brandName, category, questions[3], turnstileToken }` | Gates in order (§4); cache hit → that `checkId`; else creates a `freeCheck` and queues the job → `{ checkId, status }`. Budget reached → `{ checkId, status: 'waiting-email' }`. |
| `GET /public/free-check/:checkId` | — | `{ status, brandName, questions: [{ text, engines: [{ engine, named, position }] }], namedCount, total, otherBrandsCount, failedEngines[] }` — never other brands' names until verified. |
| `POST /public/free-check/:checkId/email` | `{ email, marketingConsent }` | Rejects invalid/disposable emails; limits (§4); stores a hashed 6-digit code (10 min, 5 tries) and emails it. |
| `POST /public/free-check/:checkId/verify` | `{ code }` | On a match: upsert the lead, mark the check verified, remove the cache entry, send the report (now, or after the queued run), return the full result with `otherBrands: [{ name, count }]`. |

`checkId` is a random 24-byte URL-safe id (not the Mongo `_id`), so results can't be guessed.

## 3. Job and data

- **Queue `free-check`** in the existing worker, concurrency 2. For each question × engine it calls the scan path for ChatGPT (`gpt-4o-mini`) and Gemini (`gemini-flash-latest`), through the existing 6-hour **AI response cache** (same question → same answer for everyone, so repeat questions in a category cost nothing). Each answer is matched with the Lost-to helpers (`nameMatcher`, brand extraction, retailer filter): brand named + position, other brands named. Calls are logged in `costLog` with `purpose: 'free-check'`.
- **Questions** come from `templateQueries(category)` minus the brand-name question, behind `freeCheckQuestions(category, market = 'IN')` so a UAE list can be added later without code changes. Part of this work: every category gets at least 4 EN questions, and weak lists (e.g. Software & SaaS: "Comparison with leading market software competitors") are rewritten as real buyer questions.
- **`freeChecks`** collection: `checkId`, url, domain, brandName, category, market, questions, ipHash, country (`IN` when the browser time zone is Asia/Kolkata, else that time zone; there is no GeoIP on the server), status (`queued | running | done | failed | waiting-email | scheduled`), result, verifiedEmail, createdAt. TTL 30 days.
- **`leads`** collection: email (unique), domain, brandName, category, market, country, checkIds[], marketingConsent + consentAt, verifiedAt, signedUpAt, createdAt. Kept.
- **Redis:** counters per IST day — `fc:ip:<hash>` (checks 3, site lookups 10, codes 5), `fc:email:<email>` (codes 3, fresh checks 2), `fc:global` (checks; limit from the admin setting, default 150); cache `fc:cache:<ipHash>:<domain>` → `checkId`, 24 h. IPs are stored only as `sha256(salt + ip)`.

## 4. Abuse and cost gates (in this order on `POST /public/free-check`)

1. nginx `limit_req` (already in place for `/api/`).
2. **Turnstile** token verified with Cloudflare's siteverify (single use). Keys: `TURNSTILE_SECRET_KEY` (API env) and `PUBLIC_TURNSTILE_SITE_KEY` (website build var). Missing secret outside production → check skipped; in production → refused.
3. **Cache** `ip + domain` (24 h): same visitor, same site → the earlier result, no AI call, whatever questions are picked. Removed after email verification, so a verified visitor can run fresh questions (within the email limit).
4. **IP limit** 3 new checks/day.
5. **Global budget** (`INCR` before queueing, atomic): over the limit → `waiting-email` flow. At 80% an email goes once per day to `FREE_CHECK_ALERT_EMAIL` (the user picks the address; empty = no alert).

A check whose engines all fail gives the global counter back and is not cached.

**Email gates:** syntax check, disposable-domain list (`disposable-email-domains` package), 3 codes per email/day, 5 per IP/day, 10-minute code, 5 attempts. Nothing but the code email goes to an unverified address.

## 5. Report email

Sent after verification through `emailService`: subject "<brand> on ChatGPT and Gemini: named in N of 6 answers"; per question the two engines' results and the brands named instead; one line of advice; button "Create a free account" (`/signup?fc=<checkId>`). Footer: "You asked for this report at geosignalai.com"; with marketing consent, an unsubscribe link (existing HMAC unsubscribe pattern, which turns `marketingConsent` off).

## 6. Signup handoff

`/signup?fc=<checkId>`: the app fetches `GET /public/free-check/:checkId`, which for a **verified** check also returns `{ email, url, category }` (the `checkId` is unguessable and only reaches the visitor's page and inbox; other brands' names stay out of this route). Signup pre-fills the email; onboarding pre-fills site, brand name, category and the 3 questions as the brand's first queries. On account creation the lead gets `signedUpAt`.

## 7. Admin → "Free checker"

- Today: checks used / limit, with an input to change the limit (`freeCheckDailyLimit` setting, applied immediately).
- Leads table: email, site, category, country, consent, verified, signed up, date; CSV download.
- Last 7 days funnel: checks → emails verified → signups.

## 8. Errors

| Case | Visitor sees |
|---|---|
| Homepage unreadable | "Site nahi padh paaye — naam aur category khud bharo" |
| One engine failed | Results of the other + "ChatGPT ne jawab nahi diya" |
| Both failed | "Abhi check nahi ho paya, 5 minute baad dobara karo" (budget refunded, not cached) |
| IP limit | "Aaj ke 3 free check ho gaye — signup karo ya kal aao" |
| Turnstile failed | "Verification fail, page refresh karo" |
| Disposable / limit on codes | Plain message, no code sent |
| Wrong / expired code | "Code galat ya purana — naya code mangao" |

## 9. Testing

- `backend/src/checks/freeCheck.check.ts` (no network): URL normalise + domain; homepage → brand name and category; question list (no brand question, ≥ 4 EN per category); gate order and every limit; cache hit and removal after verify; half result has no names; OTP expiry/attempts; disposable email refused; unknown `checkId` → 404; budget refund on total failure; consent stored.
- Staging: one real check (6 calls), Test Sheet **N13** (+ve/−ve), tester agent, then production.
- Needs from the user before staging: a Cloudflare account and a Turnstile site (site key + secret key).

## Non-goals (later)

5-email nurture series; global/UAE question lists; Claude/Perplexity in the free check; PDF of the free report; a free-check history for returning visitors.
