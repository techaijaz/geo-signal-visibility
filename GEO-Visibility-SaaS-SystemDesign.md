# System Design — AI Visibility & GEO SaaS

This document covers the *how* — architecture, scaling, reliability, and deployment. Product scope, MVP cut, and DB schema live in the companion `GEO-Visibility-SaaS-MVP.md`; this doc assumes that context and goes deeper on system-level decisions.

---

## 1. Architecture Layers

**Client Layer**
- Web dashboard (React) — primary interface
- No native mobile app in v1; responsive web covers it

**Application Layer (API server)**
- Node.js + Express, stateless — any instance can serve any request
- Handles auth, request validation, reads/writes to MongoDB, and **enqueues** work — it never calls an LLM provider directly or runs a crawl inline
- This statelessness is what lets you horizontally scale the API tier independently of the worker tier

**Async Processing Layer**
- BullMQ + Redis for the job queue
- A separate **worker pool** (own process, own deployment) pulls jobs and does the actual expensive work: querying AI providers, crawling websites/marketplaces, generating recommendations, rendering PDF reports
- This separation is the single most important architectural decision in this system — see §2

**Data Layer**
- MongoDB — primary store (brands, queries, runs, mentions, scores, recommendations, reports)
- Redis — doubles as queue broker and a light cache (session tokens, rate-limit counters, recently computed dashboard aggregates)

**External Integrations**
- Claude API, OpenAI API, Gemini API, Google AI Overview, Meta AI — called only from workers, never from the request/response cycle
- Puppeteer/Cheerio for website + marketplace crawling — same worker pool, different job type

---

## 2. Why the Queue/Worker Split Is Non-Negotiable

Every expensive operation in this product — querying 3-5 AI providers, 3-5 times each, for up to 50 queries, plus crawling a website — takes seconds to minutes and costs real money per call. If any of that ran inside an API request handler:

- A single scan would hold an HTTP connection open for minutes → timeouts, bad UX
- Concurrent scans across customers would exhaust API server threads/connections
- A retry on a flaky provider call would retry the *entire* HTTP request, not just the failed piece
- There'd be no natural place to enforce per-plan rate limits (§4) or track cost-per-brand (§5)

So: **API server only ever enqueues a job and returns immediately.** The dashboard shows "scan in progress" and polls or gets a websocket/SSE push when the job completes. This is true for the scheduled weekly/daily scan, the manual "Re-scan now" button, website/marketplace audits, and report generation — all four are queue jobs, not request-handler code.

---

## 3. Component Responsibilities

| Component | Responsibility | Does NOT do |
|---|---|---|
| API server | Auth, CRUD on brands/queries/settings, read dashboards from pre-aggregated data, enqueue jobs | Call LLM providers, crawl sites, compute scores live |
| Scan worker | Run one query against one provider N times, store raw response, run mention detection | Decide scan cadence (scheduler's job) |
| Audit worker | Crawl website + marketplace listings, check robots.txt/schema/llms.txt | Generate recommendations (separate step, may be same or different worker type) |
| Recommendation worker | Feed audit + mention data to an LLM, generate prioritized list + fix snippets | Re-run the scan itself |
| Report worker | Render current dashboard state to PDF, store, notify | Compute scores (reads already-computed `visibility_scores`) |
| Scheduler | Decides *when* each brand's next scan/audit/report job gets enqueued, per its plan's cadence | Execute any job itself |

Keeping these boundaries clean means you can scale the scan worker pool independently from the report worker pool once one becomes the bottleneck — they won't always scale at the same rate (report generation is comparatively rare and cheap; scans are frequent and expensive).

---

## 4. Multi-Tenancy & Isolation

Every document in every collection carries a `brandId`, and every brand carries an `orgId`. Two isolation guarantees this buys:

- **Data isolation**: every query in the API layer filters by `orgId` derived from the authenticated user's JWT — never trust a `brandId` in the request body/params alone without checking it belongs to the caller's org. This is what makes the agency use case (§3.9 in the MVP doc) safe: an agency's client brands are fully separated from each other even though they share the same physical database.
- **Resource isolation**: rate limits and plan quotas (queries tracked, runs per query, scan cadence) are enforced per-brand, not per-user — so one brand hitting its plan's ceiling doesn't affect a different brand in the same org.

For the free public visibility checker (§3.11 in the MVP doc), isolation is different: it's unauthenticated, so isolation there is purely rate-limiting by IP/email, with results never persisted to any brand's real data.

---

## 5. Scaling Strategy

**API tier**: stateless Express instances behind a load balancer — scale horizontally by adding instances. No sticky sessions needed since auth is JWT-based.

**Worker tier**: scale by job type, not as one monolithic pool. Concretely:
- Scan workers need the most concurrency (highest job volume) but should be **rate-limited per provider**, not just per brand — if Claude's API has a rate ceiling, one runaway customer's daily-scan plan shouldn't starve everyone else's weekly scans. Use BullMQ's per-queue concurrency + rate-limiter options, one queue per provider.
- Audit and report workers are lower-volume — a small fixed pool is enough until usage data says otherwise.

**Database**: start with a single MongoDB replica set (for durability, not sharding — sharding is premature at MVP/early-growth scale). The indexes called out in the MVP doc (`runs.queryId+ranAt`, `mentions.brandId+extractedAt`, `visibility_scores.brandId+periodStart`, `brands.orgId`) are what keep dashboard reads fast without denormalizing early. Revisit sharding only once a single replica set's write volume (mostly from `runs` and `mentions`) becomes the bottleneck — that's a Phase 3/4 problem, not a launch-day one.

**Caching**: pre-aggregate `visibility_scores` on a schedule (already in the MVP doc) rather than computing from raw `mentions` on every dashboard load — this is the single biggest read-performance lever. Redis can additionally cache the rendered Overview-tab payload per brand for a few minutes, since most users refresh the dashboard far more often than the underlying data changes.

---

## 6. Reliability & Idempotency

- **Retries**: a failed provider call (timeout, rate limit, 5xx) retries with exponential backoff at the job level — BullMQ supports this natively. Cap retries (e.g. 3) and mark the run as failed rather than retrying forever; a partial scan (7 of 8 queries succeeded) should still surface partial results rather than blocking the whole cycle.
- **Idempotency**: each scheduled job should be keyed so a duplicate trigger (e.g. scheduler double-fires, or a manual re-scan overlaps a scheduled one) doesn't double-charge API cost or create duplicate `runs` documents. A simple lock — "brand X already has a scan job in flight" — checked before enqueueing covers this.
- **Partial failure visibility**: if one provider is down, the dashboard should say so explicitly ("Gemini scan failed this cycle — retrying") rather than silently showing stale or zeroed data for that model.
- **Dead-letter handling**: jobs that exhaust retries land in a dead-letter queue for manual inspection, not silently disappear — important early on when provider APIs and prompts are still being tuned.

---

## 7. Security

- **Auth**: JWT-based, short-lived access tokens + refresh tokens; org membership and role (owner/editor/viewer — see MVP doc §3.9) embedded in the token or looked up server-side on each request.
- **Provider API keys**: stored server-side only (env vars / secrets manager), never exposed to the client. All provider calls originate from workers, which is another reason they must never run in a client-reachable request path.
- **PII/data handling**: brand and competitor data isn't especially sensitive, but user profile data (email, password hash, avatar) follows standard practice — bcrypt/argon2 hashing, no plaintext storage, and the password-change flow in Settings should require the current password before accepting a new one (not shown as a gap in the MVP doc, worth calling out here).
- **Rate limiting**: applied at three levels — per-user (login/API abuse), per-brand (plan quota), and per-IP (the unauthenticated free-checker endpoint, which is the highest-risk surface since it has no account behind it to hold accountable).

---

## 8. Deployment Topology (suggested)

For a solo-founder build reusing your existing MERN comfort zone, avoid over-engineering infra before there's real usage:

- **API + worker processes**: two separate deployable services (even if they share a codebase/monorepo) so they can scale independently — e.g. two services on Railway/Render, or two ECS services on AWS once you outgrow PaaS
- **MongoDB**: managed (Atlas) from day one — not worth self-hosting at this stage
- **Redis**: managed (Upstash/Redis Cloud) — same reasoning
- **Static frontend**: deployed separately (Vercel/Netlify/S3+CloudFront) from the API, since it's just a React build
- **Cron/scheduler**: a lightweight always-on process (or a managed cron trigger hitting an internal endpoint) that enqueues scheduled scan/audit/report jobs per brand's plan cadence — this is the one component that must run continuously even at near-zero traffic

This topology maps directly onto the Tech Stack table in the MVP doc — nothing here requires new technology choices, just a clear boundary between "always synchronous, user-facing" (API) and "always async, cost-bearing" (workers).

---

## 9. What Changes as You Move Through the MVP Doc's Phases

- **MVP**: single worker pool is fine (don't split by job type yet) — the architectural boundary (API never calls providers directly) matters from day one, but the *scaling* of workers doesn't need to be sophisticated until Phase 2 traffic arrives.
- **Phase 2**: split workers by job type as scan volume grows; introduce per-provider rate limiting once you're tracking Gemini/Perplexity alongside Claude/GPT.
- **Phase 3**: multi-brand workspace and agency accounts is when `orgId`-based isolation (§4) actually gets exercised at scale — test it explicitly before this phase, not after a customer reports a data-leak.
- **Phase 4**: category benchmarking (MVP doc §3.4) is the first feature that needs cross-brand aggregation queries — that's when you revisit whether a single replica set is still enough, or whether benchmark computation needs to move to a separate analytics store (e.g. a periodic batch job writing to a reporting collection, not a live query across every brand's `mentions`).
