# Technical Requirements Document — AI Visibility & GEO SaaS

| | |
|---|---|
| **Status** | Draft — ready for build |
| **Owner** | Aijaz Khan |
| **Version** | 1.0 |
| **Companion docs** | `GEO-Visibility-SaaS-PRD.md` (what & why), `GEO-Visibility-SaaS-MVP.md` (flow & schema sketch), `GEO-Visibility-SaaS-SystemDesign.md` (architecture) |

This document translates the PRD's functional requirements into implementable technical specs — exact API contracts, data model validations, algorithms, and configuration values. If a number or format isn't in this doc, it isn't specified yet — flag it rather than guessing during implementation.

---

## 1. Tech Stack & Versions

| Component | Choice | Version (minimum) |
|---|---|---|
| Runtime | Node.js | 20 LTS |
| API framework | Express | 4.x |
| Database | MongoDB | 7.x (Atlas M10+ for production) |
| ODM | Mongoose | 8.x |
| Queue/broker | BullMQ + Redis | BullMQ 5.x, Redis 7.x |
| Frontend | React | 18.x |
| Charting | Recharts | 2.x |
| Crawling | Puppeteer + Cheerio | Puppeteer 22.x |
| Auth | jsonwebtoken + bcrypt | — |
| PDF generation (Phase 2) | Puppeteer (reuse crawl instance type) | — |
| Validation | Zod (or Joi) on every API input | — |

---

## 2. Environment Configuration

All secrets via environment variables — never committed, never client-exposed.

```
NODE_ENV=production
PORT=4000

MONGODB_URI=
REDIS_URL=

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=30d

CLAUDE_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=

BCRYPT_SALT_ROUNDS=12

RATE_LIMIT_FREE_CHECK_PER_IP_PER_DAY=3
RATE_LIMIT_MANUAL_RESCAN_PER_BRAND_PER_DAY=3   # Starter; plan-tier override table in §7

WORKER_CONCURRENCY_SCAN=5
WORKER_CONCURRENCY_AUDIT=2
WORKER_CONCURRENCY_RECOMMENDATION=2
WORKER_CONCURRENCY_REPORT=2
```

Config is loaded once at process start and validated (fail fast on missing required var) — never read `process.env` ad hoc inside request handlers.

---

## 3. API Specification

All responses follow one envelope:

```json
// success
{ "success": true, "data": { ... } }

// error
{ "success": false, "error": { "code": "BRAND_NOT_FOUND", "message": "Brand does not exist or you don't have access." } }
```

Standard HTTP codes: `200` success, `201` created, `400` validation error, `401` unauthenticated, `403` unauthorized (wrong org), `404` not found, `409` conflict (e.g. duplicate competitor, scan already in progress), `429` rate limited, `500` unhandled.

### 3.1 `POST /api/brands`
Auth required. Creates a brand under the caller's `orgId`.

**Request:**
```json
{
  "name": "string, required, 1-100 chars",
  "website": "string, required, valid URL, normalized (strip protocol + trailing slash)",
  "category": "string, required, one of a fixed enum list",
  "region": "string, required, default 'India'",
  "competitors": [ { "name": "string, required", "website": "string, optional" } ]
}
```

**Response `201`:** the created brand document (see §5.2).

**Validation errors (`400`):** missing name/website, invalid URL, duplicate competitor name within the same request payload.

### 3.2 `POST /api/brands/:brandId/queries`
Auth required, caller must own `brandId`'s org.

**Request:**
```json
{
  "queries": [
    {
      "text": "string, required, 5-200 chars",
      "intentTag": "enum: comparison | best-of | direct | how-to",
      "language": "enum: en | hi-en | hi | ta | bn, default en"
    }
  ]
}
```

**Response `201`:** array of created query documents with generated `_id`s.

**Business rule:** total active query count for the brand must not exceed the plan's query cap (§7) — reject the whole batch with `409 QUERY_LIMIT_EXCEEDED` rather than silently truncating it.

### 3.3 `POST /api/runs/trigger`
Auth required. Manually enqueues a scan cycle for one brand.

**Request:** `{ "brandId": "string, required" }`

**Response `202` (accepted, not `200`):** `{ "jobId": "string", "status": "queued" }` — this is async, the response does not contain scan results.

**Errors:** `409 SCAN_IN_PROGRESS` if a scan job for this brand is already active; `429 RESCAN_LIMIT_EXCEEDED` if the plan's daily manual-trigger cap is hit (see §7 for exact limits per plan).

### 3.4 `GET /api/brands/:brandId/scores`
Auth required. Returns pre-aggregated visibility scores — never computed live.

**Query params:** `?range=7d|30d|90d` (default `30d`)

**Response `200`:**
```json
{
  "blended": [ { "periodStart": "ISO date", "score": 0-100 } ],
  "byProvider": {
    "claude": [ { "periodStart": "ISO date", "score": 0-100 } ],
    "openai": [ ... ],
    "gemini": [ ... ]
  },
  "benchmark": { "categoryAverage": 0-100, "brandCount": "int" }   // omitted entirely if brandCount < 10 (see §6.3)
}
```

### 3.5 `GET /api/brands/:brandId/mentions`
Auth required. Paginated.

**Query params:** `?provider=claude|openai|gemini|all&page=1&limit=50` (max `limit` = 100)

**Response `200`:** `{ "items": [ ... ], "total": "int", "page": "int", "limit": "int" }`

### 3.6 `PATCH /api/recommendations/:id`
Auth required, caller must own the recommendation's brand.

**Request:** `{ "status": "open | in-progress | done" }`

**Response `200`:** updated recommendation document. Setting `status: "done"` sets `resolvedAt` server-side — never accept `resolvedAt` from the client.

---

## 4. Core Algorithms

### 4.1 Mention Detection

Given a raw provider response (plain text) and a brand's `name` + known aliases:

```
function detectMention(responseText, brand):
    normalizedText = lowercase(responseText), strip punctuation
    candidates = [brand.name] + brand.aliases

    for candidate in candidates:
        # exact substring match first (cheap, catches ~80% of cases)
        if normalizedText.includes(lowercase(candidate)):
            position = estimatePosition(responseText, candidate)
            return { mentioned: true, position, matchType: "exact" }

        # fuzzy fallback: token-level Levenshtein distance ≤ 2 for multi-word brand names,
        # only attempted if exact match fails — this is the expensive path, don't run it first
        if fuzzyTokenMatch(normalizedText, candidate, maxDistance=2):
            position = estimatePosition(responseText, candidate)
            return { mentioned: true, position, matchType: "fuzzy" }

    return { mentioned: false, position: null }
```

**`estimatePosition`**: if the response contains a numbered/bulleted list, position = the list index containing the match. If prose (no list structure), position = 1 if the mention is in the first 25% of the response by character count, else null (treat as "mentioned but unranked" — do not force a fake position).

**Responses flagged `matchType: "fuzzy"` are logged to a review queue** — not auto-trusted at face value until the false-positive rate on fuzzy matches has been sampled and found acceptable (target: < 5% false positive rate on a manual audit of 100 fuzzy matches before removing the review-queue step).

### 4.2 Visibility Score Formula

```
mentionRate       = (runs where mentioned=true) / (total runs) for the period
avgPositionScore  = mean(1 / position) across mentioned runs, position=null treated as 1/6 (below-list-fold assumption)
sentimentScore     = 0.5 (neutral, hardcoded until sentiment classifier ships — see PRD FR-6)
shareOfVoice      = brandMentions / (brandMentions + sum(competitorMentions))   # 0 in MVP if no competitor data yet

blendedScore = round(100 * (
    0.40 * mentionRate +
    0.25 * avgPositionScore +
    0.15 * sentimentScore +
    0.20 * shareOfVoice
))
```

Weights (`0.40/0.25/0.15/0.20`) are a v1 starting point, not empirically tuned — flag in the dashboard copy as "score weighting may be recalibrated as we learn what predicts real customer visibility" so this is not silently presented as a finished, validated formula.

Per-provider score uses the same formula scoped to that provider's runs only. Blended score is a straight average of active per-provider scores (not weighted by provider) in v1.

### 4.3 Scan Job Scheduling

```
function enqueueScheduledScans():
    for brand in activeBrands:
        if brand.plan.cadence == 'daily' and hoursSinceLastScan(brand) >= 24:
            enqueue('scan', { brandId: brand._id })
        elif brand.plan.cadence == 'weekly' and daysSinceLastScan(brand) >= 7:
            enqueue('scan', { brandId: brand._id })
```

Runs as a scheduled cron job (every hour is sufficient granularity — do not run this check more frequently than the coarsest cadence requires). Before enqueueing, acquire a Redis lock keyed `scan-lock:{brandId}` with a TTL equal to the expected max scan duration (e.g. 10 minutes) — if the lock exists, skip enqueueing (a scan is already in flight, whether scheduled or manually triggered).

---

## 5. Data Model Details

Full collection sketch is in the MVP doc §4 — this section adds field-level types, validation, and indexes not spelled out there.

### 5.1 `users`
| Field | Type | Validation |
|---|---|---|
| email | String | required, unique index, lowercase, valid email format |
| passwordHash | String | required, never returned in any API response (exclude at the schema level, not per-endpoint) |
| avatarUrl | String | optional, valid URL |
| plan | String enum | `free`\|`starter`\|`growth`\|`agency`, default `free` |

### 5.2 `brands`
| Field | Type | Validation |
|---|---|---|
| name | String | required, 1-100 chars |
| website | String | required, normalized URL, unique per `orgId` (same org can't add the same site twice) |
| role | String enum | `owner`\|`client`, default `owner` |
| languages | [String] | subset of `['en','hi-en','hi','ta','bn']`, default `['en']` |

**Indexes:** `{ orgId: 1 }`, `{ orgId: 1, website: 1 }` unique compound.

### 5.3 `queries`
**Indexes:** `{ brandId: 1, active: 1 }` (the query runner's primary read pattern).

### 5.4 `runs`
| Field | Type | Validation |
|---|---|---|
| provider | String enum | `claude`\|`openai`\|`gemini`\|`google_ai_overview`\|`meta_ai`\|`perplexity` |
| rawResponse | String | required, no max length enforced at schema level but capped at provider response limit |
| cost | Number | required, in smallest currency unit (paise) to avoid float rounding issues |

**Indexes:** `{ queryId: 1, ranAt: -1 }`, `{ brandId: 1, ranAt: -1 }`.

### 5.5 `visibility_scores`
**Indexes:** `{ brandId: 1, provider: 1, periodStart: -1 }` unique compound (one score row per brand/provider/period — upsert on recompute, never duplicate).

---

## 6. Job Queue Configuration

| Queue name | Concurrency | Retry attempts | Backoff | Job TTL |
|---|---|---|---|---|
| `scan` | 5 (env-configurable, see §2) | 3 | exponential, base 5s | 15 min |
| `audit` | 2 | 2 | exponential, base 10s | 10 min |
| `recommendation` | 2 | 2 | exponential, base 10s | 5 min |
| `report` | 2 | 1 | fixed 30s | 5 min |

Jobs exceeding retry attempts move to a dead-letter list (`{queue}-failed`) rather than being discarded — inspected manually until failure patterns are well understood.

**Per-provider rate limiting**: each provider gets its own BullMQ queue limiter (e.g. `{ max: N, duration: 60000 }`) set conservatively below the provider's published rate limit, reviewed and adjusted as actual provider limits are confirmed (placeholder values only until then — do not hardcode assumed numbers into production config without confirming against current provider documentation).

### 6.1 Provider Call Specs (placeholder — confirm against current provider docs before implementation)

| Provider | Model (placeholder) | Timeout | Notes |
|---|---|---|---|
| Claude | latest generally-available model at build time | 30s | Use the Messages API, `max_tokens` capped (e.g. 1024) since only the answer text matters, not a long completion |
| OpenAI | latest generally-available GPT model at build time | 30s | Chat Completions API |
| Gemini | latest generally-available model at build time | 30s | v1.1, not MVP |

**Do not hardcode a specific model version string into this doc as if it's final** — model names change frequently; the implementing engineer should pull the current recommended model ID from each provider's own docs at build time and record the actual choice in code comments/config, not here.

---

## 7. Plan-Tier Limits (enforced server-side, not just UI-gated)

| Plan | Max queries | Runs/query | Cadence | Manual re-scans/day |
|---|---|---|---|---|
| Free | 3 | 1 | monthly | 1 |
| Starter | 15 | 3 | weekly | 3 |
| Growth | 50 | 3 | daily | 10 |
| Agency | custom (per-brand override) | custom | daily | custom |

Every endpoint that creates queries, triggers scans, or enables a provider must check the caller's brand's plan against this table server-side — the frontend hiding a button is not a security control.

---

## 8. Security Implementation

- **Passwords**: bcrypt, `BCRYPT_SALT_ROUNDS=12` (env-configurable, not hardcoded in application code).
- **JWT**: access token 15 min expiry, refresh token 30 days, refresh tokens stored hashed in DB (not plaintext) so a DB leak doesn't hand out valid refresh tokens directly. Refresh token rotation on every use (old one invalidated when a new one is issued).
- **Org-scoping middleware**: every route under `/api/brands/:brandId/*` runs a middleware that loads the brand, checks `brand.orgId === req.user.orgId`, and rejects with `403` before the route handler runs — implemented once, applied to all brand-scoped routes, not re-implemented per route.
- **Rate limiting**: `express-rate-limit` (or equivalent) keyed by IP for the free checker, by `userId` for authenticated endpoints, by `brandId` for scan triggers — three separate limiter instances, not one shared config.
- **Input validation**: every request body validated against a schema (Zod/Joi) before touching the database — reject unknown fields, don't silently ignore them.

---

## 9. Logging & Monitoring

Structured JSON logs (not plain strings) for every job execution:

```json
{ "timestamp": "ISO", "level": "info|warn|error", "jobType": "scan", "brandId": "...", "provider": "claude", "durationMs": 1200, "outcome": "success|failed|retried", "cost": 0 }
```

**Alert thresholds (initial, revisit after real usage data):**
- Any brand's per-cycle cost exceeds 150% of its plan's expected cost → alert
- Dead-letter queue depth > 20 → alert
- Any provider's failure rate > 20% over a 1-hour window → alert (likely a provider-side outage, not a per-brand issue)

---

## 10. Testing Requirements

| Layer | Requirement |
|---|---|
| Unit | Mention detection algorithm (§4.1) and score formula (§4.2) must have unit tests covering: exact match, fuzzy match, no match, null position, zero-competitor share-of-voice |
| Integration | Every API endpoint in §3 has at least one happy-path test and one auth-failure test (wrong org's `brandId`) |
| Job/queue | Scan job retry-and-backoff behavior tested with a mocked failing provider call |
| E2E (critical path only) | Signup → onboarding → first scan → dashboard shows a score. This single path must never break silently; treat as a release-blocking smoke test. |

Org-isolation (§8) specifically needs an explicit test: create two orgs, two brands, confirm org A's token cannot read/write org B's brand data via any endpoint — this is a security requirement, not just a feature test, and should not be considered "probably fine because the code looks right."

---

## 11. CI/CD (suggested minimum)

- Lint + unit tests run on every PR; merge blocked on failure
- Integration tests run against a disposable MongoDB/Redis (Docker Compose or Testcontainers) in CI, not against a shared dev database
- Separate deploy pipelines for the API service and the worker service (per System Design doc §8) — a worker-only change should not require redeploying the API, and vice versa
- Environment promotion: local → staging → production, with staging using real provider APIs but a hard low rate-limit/cost cap to prevent a staging bug from generating a large provider bill

---

## 12. Coding Standards

- TypeScript strongly preferred over plain JS for the API/worker codebase, given the number of cross-service data shapes (run → mention → score) that benefit from compile-time checking — if staying with plain JS for speed, JSDoc type annotations are the minimum bar.
- All async job handlers must be idempotent-safe re-runs (§4.3's lock pattern) — a handler that isn't safe to run twice for the same input is a bug, not an edge case, given retry-on-failure is standard here.
- No provider API keys, connection strings, or other secrets in code, comments, or committed config files — env vars only (§2).
