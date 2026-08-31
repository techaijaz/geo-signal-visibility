# Product Requirements Document — AI Visibility & GEO SaaS

| | |
|---|---|
| **Status** | Draft — ready for build |
| **Owner** | Aijaz Khan |
| **Version** | 1.0 |
| **Companion docs** | `GEO-Visibility-SaaS-MVP.md` (flow, DB schema, API design), `GEO-Visibility-SaaS-SystemDesign.md` (architecture, scaling, reliability) |

---

## 1. Executive Summary

A SaaS product that tracks how a brand appears inside AI-generated answers (Claude, ChatGPT, Gemini, Google AI Overview, Meta AI) for real customer queries — in English and Hinglish — and turns that visibility data into a prioritized, actionable fix list. Supports both founders running multiple brands and agencies managing multiple client brands from a single account.

**Category:** GEO (Generative Engine Optimization) / AEO (Answer Engine Optimization).

---

## 2. Problem Statement

Buyers increasingly ask AI assistants for recommendations instead of searching Google. If a brand doesn't appear in those answers, it effectively doesn't exist to that customer — and no existing tool tells an Indian D2C/SaaS founder whether that's happening to them, why, or what to do about it. Traditional SEO tools measure Google ranking, which is a related but different problem.

---

## 3. Goals & Success Metrics

| Goal | Metric | Target (post-launch, 90 days) |
|---|---|---|
| Prove the core loop has value | % of trial users who complete onboarding + first scan | ≥ 60% |
| Prove recommendations drive retention | % of active brands with ≥1 recommendation marked done within 30 days | ≥ 40% |
| Prove willingness to pay | Free → paid conversion rate | ≥ 8% |
| Keep unit economics sane | Average API cost per paying brand per month | < 20% of that brand's plan price |
| Validate the India-specific bet | % of tracked queries that are Hinglish/regional (Starter+ plans) | ≥ 15% of total query volume |

**Non-goal metrics for v1:** agency-tier revenue, category benchmark accuracy, marketplace-listing-fix conversion — these are Phase 3/4 bets and shouldn't gate launch.

---

## 4. Target Users & Personas

**Primary — Solo D2C/SaaS founder ("Founder Aman")**
Runs one or two brands, no dedicated marketing team, checks metrics on his phone between other tasks. Wants a clear number and a clear next action, not a research tool. Price-sensitive; needs the free tier or free checker to convince him the problem is real before paying.

**Secondary — In-house marketer at a funded startup ("Marketer Priya")**
Manages GEO alongside SEO for one brand, reports up to a founder/CMO. Wants weekly reports she can forward, competitor comparisons she can screenshot into a slide, and enough depth to defend recommendations to leadership.

**Secondary — Agency account manager ("Agency Ravi")**
Manages GEO visibility for 5-15 client brands. Needs a workspace overview, not a single-brand tool, and needs to hand clients a report that looks like the agency's own product, not a third-party tool's.

---

## 5. Scope — In v1 (MVP)

1. Single-brand onboarding: brand details, manual competitor entry, manual + auto-suggested query list (10-15 queries)
2. Query runner against Claude + GPT (Gemini in v1.1), 3 runs/query, weekly cadence, queue-based
3. Manual "Re-scan now" trigger, plan-rate-limited
4. Mention detection: presence + position (fuzzy match); sentiment hardcoded neutral in v1
5. Visibility score: mention rate + position only (share-of-voice deferred to v1.1)
6. Website audit: robots.txt + schema.org checks only
7. Recommendations: one LLM call per audit cycle, checklist with effort/impact tags, manual done-tracking
8. Dashboard: Overview (score + trend), Mentions table, Recommendations tab
9. Settings: brand profile, personal profile, scan schedule
10. Auth: email/password + Google login, JWT-based

## 6. Scope — Explicitly Out of v1 (build per roadmap phases)

- Multi-brand workspace / agency accounts and brand switcher
- Hinglish/regional query tracking
- Google AI Overview, Meta AI, Perplexity as providers
- Category benchmarking
- Marketplace listing audits (Amazon/Flipkart/Nykaa)
- Auto-generated fix snippets ("Generate fix" code blocks)
- Free public visibility checker (growth hook)
- WhatsApp digest and reply-to-mark-done
- PDF report generation/history
- White-label reports
- Pricing/plan self-serve upgrade flow (v1 can be manually invoiced)

Each of these has a full spec already written in the MVP doc and should be pulled into this PRD's scope only when its phase (§9 there) is reached — do not let scope silently expand mid-build.

---

## 7. Functional Requirements

Each requirement includes acceptance criteria — the bar for "done," not just "built."

### 7.1 Onboarding
- **FR-1**: User can create a brand with name, website, category, region.
  - *AC*: Brand is not saved without name + website; website is normalized (strip protocol/trailing slash) before storage.
- **FR-2**: User can add/remove competitors manually.
  - *AC*: Duplicate competitor names for the same brand are rejected with an inline message, not silently deduped.
- **FR-3**: User can select/deselect auto-suggested queries and add custom ones.
  - *AC*: At least 1 query must be active before onboarding can complete; system warns (not blocks) if fewer than 5 are selected, since low query count weakens the score's signal.

### 7.2 Query Runner
- **FR-4**: System runs every active query against every enabled provider, 3x per provider, on the brand's scheduled cadence.
  - *AC*: A run failure on one provider does not block runs on other providers for the same query; the failed run is retried up to 3 times with backoff before being marked failed.
- **FR-5**: User can trigger a manual re-scan.
  - *AC*: Manual re-scan is disabled (with a visible cooldown message) if one is already in progress or if the brand has hit its plan's manual-trigger limit for the period.

### 7.3 Mention Detection & Scoring
- **FR-6**: Each stored response is checked for brand presence and position.
  - *AC*: Fuzzy match tolerates minor spelling variants and known aliases; a false-negative-prone response (e.g. brand referred to only by product name) is logged for manual review, not silently scored as absent.
- **FR-7**: Visibility score recomputes after every completed scan cycle.
  - *AC*: Score computation runs as a scheduled job against stored `mentions`, never live from the dashboard request; dashboard always reads the last pre-computed score.

### 7.4 Website Audit
- **FR-8**: System crawls the brand's website and checks robots.txt directives (GPTBot, ClaudeBot, Google-Extended) and schema.org presence (Product, Organization, FAQPage).
  - *AC*: A site that blocks the crawler entirely (403/robots disallow on the crawler itself) surfaces a clear "couldn't audit — check access" state, not a false "all issues clear" result.

### 7.5 Recommendations
- **FR-9**: System generates a prioritized recommendation list per audit cycle.
  - *AC*: Every recommendation has a category, effort, and impact tag — none may be blank. List is capped (e.g. 8) to avoid overwhelming a first-time user.
- **FR-10**: User can mark a recommendation done.
  - *AC*: Marking done updates a visible progress counter immediately (optimistic UI) and persists without requiring a page reload.

### 7.6 Dashboard
- **FR-11**: Overview tab shows blended score, per-model scores, and a trend line.
  - *AC*: If a brand has fewer than 2 completed scans, the trend line is hidden with a "not enough data yet" message rather than rendered as a flat/misleading line.
- **FR-12**: Mentions tab shows a filterable, sortable table of query-level results.
  - *AC*: Table paginates or virtualizes beyond 50 rows — must not render an unbounded table.

### 7.7 Settings & Account
- **FR-13**: User can update personal profile (name, email, avatar, password) and brand profile independently.
  - *AC*: Password change requires current password confirmation; email change requires re-verification before taking effect.

### 7.8 (Phase 2+) Multi-Brand Workspace
- **FR-14**: User with more than one brand lands on a workspace grid after login; can switch brands without logging out.
  - *AC*: Switching brands never leaks another brand's data into the previously loaded view — verify via an explicit isolation test, not just visual inspection.

*(Phase 2/3 requirements for language tracking, new providers, marketplace audits, snippets, WhatsApp, reports, and the free checker are detailed in the MVP doc's §3 and should be converted into FR-style acceptance criteria at the start of the sprint that builds them, following the same format as above.)*

---

## 8. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | Dashboard loads (Overview tab) in < 1.5s p95 from pre-aggregated data — never computed live from raw mentions |
| **Availability** | API tier: 99.5% uptime target for v1 (single-region is acceptable; no multi-region requirement at this stage) |
| **Scalability** | API and worker tiers scale independently (see System Design doc §5); provider rate limits are the expected first ceiling, not infra |
| **Reliability** | Failed provider calls retry with backoff (max 3 attempts); partial scan failures surface explicitly rather than silently degrading data |
| **Security** | JWT auth, bcrypt/argon2 password hashing, provider API keys server-side only, org-scoped data isolation enforced on every query |
| **Cost control** | Per-brand cost tracked on every `run` document; alerting if a brand's cycle cost exceeds a plan-tier threshold |
| **Data integrity** | A single run's non-determinism is never presented as a definitive result — UI always frames scores as "based on N runs" |
| **Observability** | Every job (scan/audit/recommendation) logs start, end, provider, and outcome; dead-letter queue exists for exhausted retries |

---

## 9. System Design Reference

Full architecture — component responsibilities, queue/worker separation, multi-tenancy isolation, scaling strategy, and deployment topology — is specified in `GEO-Visibility-SaaS-SystemDesign.md`. The one requirement that most affects how this PRD gets built: **the API layer must never call an LLM provider or run a crawl inline** — every expensive operation is a queued job. This is a hard constraint on implementation, not a suggestion.

---

## 10. Data Requirements Reference

Full MongoDB schema (collections, fields, indexes) is specified in `GEO-Visibility-SaaS-MVP.md` §4. Any new field introduced during build that isn't in that schema should be added there before being shipped, so the schema doc stays the single source of truth rather than drifting from the actual database.

---

## 11. Release Plan

| Release | Contents | Gate to proceed to next |
|---|---|---|
| **v1 (MVP)** | §5 scope only | ≥ 5 real brands complete onboarding + first scan without founder hand-holding |
| **v1.1** | Gemini provider, sentiment classification, share-of-voice | Core loop retention metric (§3) trending upward |
| **v2 (Phase 2)** | Auto-generated fix snippets, PDF reports, WhatsApp digest | Recommendation-completion metric (§3) hit |
| **v3 (Phase 3)** | Multi-brand workspace, agency accounts, white-label, Hinglish tracking, new providers, marketplace audits | Paid conversion metric (§3) hit, and at least one agency lead in pipeline |
| **v4 (Phase 4)** | Category benchmarking, historical/predictive insights, free public checker | Enough brands-per-category (10+) to make benchmarking meaningful and anonymous |

---

## 12. Assumptions & Dependencies

- Claude, OpenAI, and Google APIs remain accessible at reasonable cost/rate limits for a commercial monitoring use case — not yet confirmed against each provider's ToS (flagged as a risk in the System Design doc, needs legal/ToS review before v1.1 scales volume).
- Meta AI and Google AI Overview do not currently have public, stable APIs for this kind of query-and-capture use case as of this writing — this needs a technical feasibility spike before Phase 3 commits to them; if no reliable API exists, this becomes a scraping-based (higher-risk, higher-maintenance) integration instead.
- MongoDB Atlas + a managed Redis (Upstash/Redis Cloud) are assumed as the hosting baseline per the System Design doc; no self-hosted infra in v1.

---

## 13. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Non-determinism makes scores feel arbitrary to users | Trust/churn | Always show "based on N runs," never a single-run number |
| API cost creep erodes margin | Business model | Per-brand cost tracking from day one (NFR, §8) |
| Provider ToS restricts bulk/automated querying | Legal/existential | ToS review before scaling volume past MVP |
| Meta AI / Google AI Overview have no stable API | Feature can't ship as planned | Feasibility spike before Phase 3 commitment (§12) |
| Category benchmark reveals a single competitor's score in a thin category | Privacy/trust | Enforce minimum brand-count threshold before displaying any benchmark (already in MVP doc schema notes) |
| Free checker abused for scraping/cost drain | Cost | Aggressive IP/email rate limiting, fixed cheap query set only |

---

## 14. Open Questions

1. Does the free visibility checker require an email capture before showing results, or fully anonymous? (Affects lead-gen value vs. conversion friction.)
2. What's the actual legal/ToS position on automated bulk querying for each provider — has this been checked, or only assumed?
3. For the agency tier, is billing per-brand, per-workspace, or a flat agency rate? Not yet decided in the MVP doc's pricing table.
4. Is sentiment classification (deferred past MVP) worth a dedicated small-model pass, or can it wait until real user feedback says mention position alone isn't enough signal?

---

## 15. Appendix

- `GEO-Visibility-SaaS-MVP.md` — full system flow, module-by-module spec, DB schema, REST API design, tech stack, cost management, monetization
- `GEO-Visibility-SaaS-SystemDesign.md` — architecture layers, scaling strategy, reliability, security, deployment topology
- `geo-visibility-flow.html` — clickable UI prototype covering the full flow (login → onboarding → dashboard → settings → pricing)
