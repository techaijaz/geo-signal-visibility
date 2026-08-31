# AI Visibility & GEO Optimization SaaS — Full MVP → Scale Blueprint

**Product one-liner:** A SaaS that tracks how brands/products show up in AI answers (Claude, ChatGPT, Gemini, Google AI Overview, Meta AI) for relevant queries — in English and Hinglish — and recommends concrete content/technical changes to improve that visibility. Supports both solo founders managing their own brand(s) and agencies managing multiple client brands from one workspace.

**Category:** GEO (Generative Engine Optimization) / AEO (Answer Engine Optimization) — the "SEO tool" equivalent for the LLM-answer era.

**Target user (v1):** Indian D2C/SaaS founders and marketing teams who want to know "does ChatGPT recommend me or my competitor?" — including founders who run more than one brand, and agencies managing visibility for multiple clients.

---

## 1. Problem & Positioning

Traditional SEO tools (Ahrefs, SEMrush) tell you where you rank on Google. Nobody tells Indian SMBs where they rank inside an AI's answer. That answer increasingly *is* the buying decision — a user asks "best CRM for small business India" and just picks whatever ChatGPT/Gemini says.

**Core value prop to sell:**
1. "See if AI even knows you exist."
2. "See how you compare to competitors inside the actual AI answer."
3. "Get a prioritized checklist to fix it."

Point 3 is what makes this a SaaS people pay for repeatedly, not a one-time report.

---

## 2. High-Level System Flow (A → Z)

```
[User Logs In]
     │
     ▼
[Workspace — "Your Brands"] ──► grid of all brands (own + client), pick one or "+ Add brand"
     │
     ▼
[Add Brand + Website + Competitors]
     │
     ▼
[Query Set Generation] ──► auto-suggested (English + Hinglish) by LLM + user-added manual queries
     │
     ▼
[Scheduled Query Runner] ──► fan-out to Claude API / OpenAI API / Gemini API / Google AI Overview / Meta AI
     │                              (each query run N times for consistency)
     ▼
[Response Capture & Storage] (raw text + metadata per run)
     │
     ▼
[Mention Detection Engine] ──► brand found? position? sentiment? competitors mentioned?
     │
     ▼
[Visibility Score Calculation] ──► per model, per query, aggregated trend over time + category benchmark
     │
     ▼
[Website + Marketplace Audit Engine] ──► schema.org, llms.txt, robots.txt, content structure,
     │                              FAQ presence, third-party citations, Amazon/Flipkart/Nykaa listing readability
     ▼
[Recommendation Engine] (LLM-powered) ──► diffs current state vs. what "visible" competitors do,
     │                              auto-generates ready-to-paste fix snippets (robots.txt, llms.txt, schema)
     ▼
[Dashboard] ──► score trends, mention table, competitor comparison, benchmark, action checklist
     │
     ▼
[Action Tracking] ──► user marks recommendations done → re-audit → score moves
     │
     ▼
[Alerts/Reports] ──► weekly email/WhatsApp digest: "your score moved from 42 → 51"; PDF report history
     │
     ▼
[Brand Switcher] ──► jump to another owned/client brand without logging out
```

---

## 3. Core Modules

### 3.1 Onboarding & Brand Setup
- Existing users land in the **Workspace** (see 3.9) first, not straight into a single brand — new users go straight into brand setup
- Brand name, website URL, category/industry, competitor list (manual or auto-suggested via web search)
- System auto-generates a starter query set using an LLM prompt like:
  > "Generate 20 realistic search queries a potential customer would type into ChatGPT to find a product like [category] in [region]. Include natural Hinglish phrasing alongside English, since Indian users frequently mix languages when talking to AI assistants."
- User can edit/add/remove queries, tag them by intent (comparison, best-of-list, how-to, direct brand query) and by language (English / Hinglish / regional)

### 3.2 Query Runner (the tracking engine)
- Each active query is run against tracked providers: Claude, GPT, Gemini, Google AI Overview, Meta AI, (optionally Perplexity) — which providers are active is plan-gated (see §10)
- Run each query **3–5 times per provider per cycle** — LLM outputs are non-deterministic; single-run data is noise, not signal
- Store raw response + timestamp + model + run index + query language
- Default cadence: weekly for most plans, daily for premium/enterprise
- Use a job queue (not synchronous calls) — this is the most API-cost-sensitive part of the whole product
- Manual **"Re-scan now"** trigger available from the dashboard header, rate-limited per plan tier so it can't be abused to bypass the queue economics

### 3.3 Mention Detection Engine
For every stored response, extract:
- **Presence**: is the brand name (+ known aliases) mentioned? (fuzzy match, not just exact string)
- **Position**: is it the first suggestion, in a numbered list, buried in paragraph 4?
- **Sentiment**: positive / neutral / negative framing (use a cheap classifier call or a smaller LLM pass)
- **Competitor co-mentions**: which competitors appeared in the same response, and in what order
- **Citation type**: did the AI cite a source (e.g., "according to G2...")? This tells you *where* the AI is pulling brand data from — often more actionable than the mention itself

### 3.4 Visibility Score
A composite metric per brand, e.g.:

```
VisibilityScore = w1*(mention_rate) + w2*(avg_position_score) + w3*(sentiment_score) + w4*(share_of_voice_vs_competitors)
```

- `mention_rate`: % of query runs where brand appears at all
- `avg_position_score`: normalized inverse of rank position (1st = 1.0, 5th = 0.2, absent = 0)
- `sentiment_score`: -1 to 1 scaled to 0–1
- `share_of_voice`: brand mentions ÷ (brand + all tracked competitor mentions)

Track this per model (Claude score may differ wildly from Gemini score — that's a sellable insight itself) and as a blended overall score. Show trend line over weeks.

**Category benchmark:** alongside the brand's own trend, show an anonymized, aggregated average score for other brands Signal tracks in the same category (e.g., "You: 58 · Skincare category average: 45"). This only becomes meaningful once there's enough customer volume in a category, but the schema and dashboard slot should exist from early on — it's a strong differentiator once populated and something no single-brand-report competitor can offer.

### 3.5 Website Audit Engine
Crawl the user's site (Puppeteer/Cheerio) and check for AI-crawler/parsing friendliness:
- `robots.txt` — are GPTBot, ClaudeBot (anthropic-ai), Google-Extended allowed or blocked?
- `llms.txt` presence (emerging standard some crawlers respect)
- Structured data: `Product`, `Organization`, `FAQPage`, `Review` schema via JSON-LD
- Content structure: clear H1/H2, direct-answer paragraphs near the top, FAQ sections (LLMs favor extractable, self-contained chunks over marketing fluff)
- Freshness signals: last-modified dates, dated content
- External footprint: presence/absence on Reddit, Wikipedia, G2/Capterra, Quora, YouTube — these are heavily-weighted sources in AI training/retrieval, and something the website itself can't fix but the recommendation engine should flag ("get 5 genuine reviews on G2" is a real, actionable recommendation)
- **Marketplace listing readability** (for D2C/e-commerce brands): AI shopping assistants increasingly pull product data straight from Amazon/Flipkart/Nykaa listings rather than the brand's own site. Audit listing completeness — clear bullet points, structured attributes (size, ingredients, material), enough reviews — since a well-optimized website doesn't help if the marketplace listing is thin. This is a gap most GEO tools (built for B2B SaaS) don't cover, and a real differentiator for D2C-heavy markets like India.

### 3.6 Recommendation Engine
This is the retention driver — visibility tracking alone is a report; recommendations are a product.

Flow:
1. Feed the LLM: current audit results + current visibility scores + a sample of actual AI responses where competitor was chosen over the brand
2. Prompt pattern: *"Here is Brand A's website audit and here's why an AI model chose Brand B instead in this response: [text]. Give 5 specific, prioritized, non-generic actions Brand A can take, ranked by expected impact and effort."*
3. Output structured JSON: `{ recommendation, category (content/technical/off-site), effort (low/med/high), expected_impact (low/med/high), status }`
4. Store recommendations per brand, let users mark them "done," and re-run the audit after N days to show score delta — this closes the loop and proves ROI, which is what justifies renewal.

**"Fix it for me" layer:** for technical recommendations (robots.txt rules, llms.txt content, schema.org JSON-LD), don't just describe the fix — generate the actual ready-to-paste snippet on demand ("Generate fix" button → code block + "Copy" button). Most Indian SMB founders won't implement a fix described only in prose; handing them working code they can paste directly is what turns a recommendation from "homework" into something they'll actually ship the same day. This is a natural upsell wedge too — a higher tier could offer "we implement it for you" as a paid service on top of the free snippet.

### 3.7 Dashboard (Frontend)
- **Header** (persistent across all tabs): current brand name + last-scanned timestamp, a manual **"Re-scan now"** button, and a user avatar with a dropdown (Profile settings, Brand settings, Log out)
- **Overview tab**: blended visibility score + trend graph, per-model breakdown (Claude vs GPT vs Gemini vs Google AI Overview vs Meta AI), and the category benchmark comparison
- **Mentions tab**: query-level table (query | model | mentioned? | position | sentiment | last checked), filterable by model/platform
- **Competitors tab**: share-of-voice stacked bar + head-to-head comparison table
- **Website audit tab**: crawler access, structured data, off-site footprint, and marketplace listing readability
- **Recommendations tab**: prioritized checklist with effort/impact tags, checkbox to mark done, and "Generate fix" snippet buttons on technical items
- **Reports tab**: on-demand report generation, history of past auto-generated reports (downloadable), and a sharing list for teammates/agency contacts
- **Settings tab**: personal profile (name, email, avatar, password), brand profile, competitors, scan schedule, models & platforms tracked, language & region tracking, notifications, plan & billing, delete brand
- **Pricing tab**: plan comparison with current plan highlighted and upgrade CTAs
- **Footer** (persistent): copyright + Help/Status/Privacy/Contact links

### 3.8 Notifications
- Score drop/spike alert
- New competitor detected in responses (brand you didn't add showing up repeatedly)
- Weekly summary digest via email
- **WhatsApp digest** — user connects their number from Settings; beyond just receiving the digest, a later version lets users **reply on WhatsApp to mark a recommendation done**, since WhatsApp — not a web dashboard — is the primary daily tool for most Indian SMB founders

### 3.9 Multi-Brand & Agency Workspace
Two real usage patterns need to be supported, not just a single brand per account:

- **One user, multiple brands**: a founder running more than one business (e.g., a skincare brand and a footwear brand) needs to switch between them without separate logins. Both brands sit under the same `orgId`.
- **Agencies managing client brands**: an agency needs a workspace showing all client brands at a glance, with the ability to open any one into its full single-brand dashboard.

Implementation:
- After login, land on a **Workspace screen** — a grid of brand cards (name, category, blended score, last scanned, per-model mini scores), each tagged **Owner** or **Client** so agency-managed brands are visually distinct from the user's own
- A **"+ Add brand"** card in the same grid starts onboarding for a new brand under the same account
- Inside a brand's dashboard, a **brand switcher** in the sidebar (brand name + role, with a dropdown) lets the user jump to another brand or back to the full workspace without logging out
- **White-label reports** (Agency plan): strip Signal branding from generated PDF reports and reports emails, replace with the agency's own logo/name, for reselling to their own clients
- Team roles (later phase): Owner/Editor/Viewer permissions scoped per brand, so an agency can assign specific team members to specific client brands

### 3.10 Language & Regional Query Tracking
Existing GEO tools (Profound, Otterly, Peec AI) are built English-first for US/Europe markets. For India specifically:
- Track **Hinglish queries** as their own first-class category — real customers type things like "sasta vitamin C serum kaunsa best hai," not just the English translation
- Regional language support (Hindi/Devanagari, Tamil, Bengali, etc.) as a higher-tier add-on once AI models answer meaningfully in those languages
- Settings expose per-language toggles so brands only pay for/track what's relevant to their customer base
- This is a genuine moat: a global competitor has little incentive to rebuild this for a market-specific need, but it's high-impact for Indian brands whose customers don't search in pure English

### 3.11 Growth Hook — Free Visibility Checker
A free, no-signup "Get your free AI visibility score" entry point (surfaced on the login/landing screen) that runs a lightweight one-time scan against a handful of default queries for a brand name + website. This does two things: generates leads before the category is well understood, and educates the market on a problem most Indian founders don't yet know exists — similar to how free SEO checkers (Ubersuggest, etc.) drove awareness for SEO tooling in its early days. Rate-limit heavily since it's unauthenticated and API-cost-exposed.

---

## 4. Database Schema (MongoDB — fits your MERN stack)

```js
// users
{
  _id, name, email, passwordHash, avatarUrl, plan, createdAt,
  orgId // for team accounts
}

// orgs  (new — an org can own multiple brands, e.g. a solo founder's 2 businesses or an agency's client roster)
{
  _id, name, ownerId, whiteLabelEnabled, createdAt
}

// brands
{
  _id, orgId, name, website, category, region,
  role,              // 'owner' | 'client' — drives the Owner/Client tag in the workspace grid
  competitors: [ { name, website } ],
  languages: [String], // ['en','hi-en','hi','ta', ...] — which query languages are tracked for this brand
  createdAt
}

// queries
{
  _id, brandId, text, intentTag, // 'comparison' | 'best-of' | 'direct' | 'how-to'
  language,          // 'en' | 'hi-en' | 'hi' | 'ta' | 'bn' ...
  active: Boolean, createdAt
}

// runs
{
  _id, queryId, brandId, provider, // 'claude' | 'openai' | 'gemini' | 'google_ai_overview' | 'meta_ai' | 'perplexity'
  runIndex, rawResponse, tokensUsed, cost, ranAt
}

// mentions
{
  _id, runId, brandId,
  brandMentioned: Boolean,
  position: Number,        // null if absent
  sentiment: Number,       // -1 to 1
  competitorsMentioned: [ { name, position, sentiment } ],
  citedSources: [String],
  extractedAt
}

// visibility_scores  (pre-aggregated, computed on a schedule — don't compute live from raw mentions every dashboard load)
{
  _id, brandId, provider, periodStart, periodEnd,
  mentionRate, avgPositionScore, sentimentScore, shareOfVoice, blendedScore
}

// category_benchmarks  (new — anonymized aggregate, powers the "you vs category average" panel)
{
  _id, category, periodStart, periodEnd,
  avgBlendedScore, brandCount   // only compute/display once brandCount is large enough to stay anonymous
}

// website_audits
{
  _id, brandId, crawledAt,
  robotsTxt: { gptBotAllowed, claudeBotAllowed, googleExtensionAllowed },
  llmsTxtPresent: Boolean,
  schemaFound: [String],       // ['Product','FAQPage', ...]
  contentIssues: [String],
  externalFootprint: { reddit: Boolean, wikipedia: Boolean, g2: Boolean, quora: Boolean },
  marketplaceListings: [ { platform, status, issues: [String] } ]  // 'amazon' | 'flipkart' | 'nykaa'
}

// recommendations
{
  _id, brandId, auditId, category, // 'content' | 'technical' | 'off-site'
  text, effort, expectedImpact, status, // 'open' | 'in-progress' | 'done'
  fixSnippet,        // generated code/text for "Generate fix" (robots.txt rule, llms.txt content, schema JSON-LD) — null if not applicable
  createdAt, resolvedAt
}

// reports  (new — powers the Reports tab download/history)
{
  _id, brandId, generatedAt, blendedScoreAtGeneration, pdfUrl, sharedWith: [String] // emails
}

// jobs (for the queue — or use a dedicated queue store like Redis/BullMQ instead of Mongo)
{
  _id, type, payload, status, retries, scheduledFor
}
```

Indexes to add early: `runs.queryId + ranAt`, `mentions.brandId + extractedAt`, `visibility_scores.brandId + periodStart`, `brands.orgId` (for the workspace grid query) — dashboard queries will hit these constantly.

---

## 5. API Design (REST, matches your existing stack conventions)

```
GET    /api/orgs/:id/brands             list all brands in the workspace (owner + client, for the "Your Brands" grid)
POST   /api/brands                      create brand + competitors
GET    /api/brands/:id                  brand overview
POST   /api/brands/:id/queries          add/generate queries (supports language param: en | hi-en | hi ...)
GET    /api/brands/:id/queries          list queries

POST   /api/runs/trigger                manual "run now" (rate-limited per plan)
GET    /api/brands/:id/scores           visibility score trend
GET    /api/brands/:id/benchmark        category benchmark comparison
GET    /api/brands/:id/mentions         query-level mention table

POST   /api/brands/:id/audit            trigger website + marketplace listing audit
GET    /api/brands/:id/audit/latest     latest audit results

GET    /api/brands/:id/recommendations  list recommendations
PATCH  /api/recommendations/:id         mark done / in-progress
GET    /api/recommendations/:id/snippet generate the ready-to-paste fix snippet on demand

GET    /api/brands/:id/competitors/compare   share-of-voice comparison

GET    /api/brands/:id/reports          report history
POST   /api/brands/:id/reports/generate generate a new report now

PATCH  /api/users/:id/profile           update name/email/avatar/password
POST   /api/users/:id/whatsapp/connect  connect WhatsApp for digest + reply-to-mark-done

POST   /api/public/free-check           unauthenticated, rate-limited free visibility checker (growth hook)
```

---

## 6. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + Express | Matches your existing stack (AIExpenser, HOPS, etc.) |
| DB | MongoDB | Flexible schema for varied AI responses; you're already comfortable here |
| Queue | BullMQ + Redis | Query runner MUST be async/queued — this is the highest-cost, highest-latency part |
| Frontend | React + Recharts/Chart.js | Dashboards, trend lines, comparison charts |
| Crawling | Puppeteer (JS rendering) + Cheerio (static parse) | Puppeteer for JS-heavy sites, Cheerio for speed on static ones — try Cheerio first, fall back to Puppeteer |
| LLM Calls | Claude API, OpenAI API, Gemini API — direct, not through a wrapper | You need raw responses per provider, not a unified abstraction that hides differences |
| Scheduler | node-cron (MVP) → BullMQ repeatable jobs (scale) | Weekly/daily run cycles per brand's plan tier |
| Auth | JWT + org-based multi-tenancy from day 1 | Cheap to build now, painful to retrofit later — this is exactly what makes the multi-brand workspace and agency use case possible without a rebuild |
| Notifications | Nodemailer (email) / WhatsApp Business API (India-specific differentiator) | |
| Reports | Puppeteer (render dashboard → PDF) or a headless-Chrome PDF service | Same Puppeteer instance used for crawling can double up for PDF report generation |

---

## 7. MVP Scope (build this first, nothing more)

1. Brand onboarding (manual competitor entry, no auto-suggest yet)
2. Manual query list (10–15 queries), no auto-generation yet
3. Query runner: Claude + GPT only (add Gemini in v1.1) — run each query 3x, weekly cadence, queued
4. Mention detection: simple fuzzy-match presence + position; skip sentiment classifier in MVP (hardcode neutral)
5. One basic visibility score (mention_rate + position only — skip share-of-voice math initially)
6. Website audit: robots.txt check + schema.org check only (skip llms.txt, external footprint for v1.1)
7. Recommendations: single LLM call per brand per audit cycle, not per-competitor-diff yet
8. Dashboard: score trend line + query mention table only — no comparison charts yet

**Ship this in 3–4 weeks solo, then layer in Gemini, sentiment, share-of-voice, and the WhatsApp digest.**

**Explicitly out of MVP scope** (build these in Phase 2/3 per §9, not on day one): multi-brand workspace/agency support, Hinglish/regional query tracking, Google AI Overview and Meta AI as providers, category benchmarking, marketplace listing audits, auto-generated fix snippets, and the free public visibility checker. All of these are real differentiators, but bundling them into the first build multiplies scope before you've validated that a single founder will pay for the core loop at all.

---

## 8. Cost & Rate-Limit Management (this will break your margins if ignored)

- **Never call APIs synchronously from a dashboard request.** All runs go through the queue.
- **Cap runs per plan tier**: e.g., Free = 5 queries/weekly/1 run each; Pro = 25 queries/weekly/3 runs each; Enterprise = daily/5 runs.
- **Cache aggressively**: if two brands in the same category share near-identical queries, consider generic "market" queries run once and matched against multiple brands' mention detection — don't literally duplicate the API call per customer for generic queries.
- **Batch API calls** where providers support batch endpoints (cheaper, async) for non-urgent scheduled runs.
- **Track cost per brand per cycle** in the `runs` collection (`tokensUsed`, `cost`) so you can see margin per customer, not just aggregate spend.

---

## 9. Scaling Roadmap (post-MVP)

**Phase 2 (Growth):**
- Auto query-generation from category + region via LLM, including Hinglish phrasing
- Add Gemini + Perplexity as providers
- Sentiment classification pass
- Share-of-voice competitor charts
- Recommendation → action → re-audit loop (proves ROI, drives renewals)
- Auto-generated "fix it for me" snippets (robots.txt, llms.txt, schema JSON-LD) on recommendations
- On-demand + scheduled PDF reports with a shareable history

**Phase 3 (Scale):**
- Multi-brand workspace: one account, multiple owned brands, with a brand switcher
- Multi-tenant agency accounts managing multiple client brands from a single workspace grid, with Owner/Client role tagging
- White-label reports for agencies reselling this to their own clients
- Public API for the recommendation engine (other tools plug into your visibility data)
- llms.txt + external footprint auditing (Reddit/G2/Wikipedia presence signals)
- Marketplace listing audits (Amazon/Flipkart/Nykaa) for D2C/e-commerce brands
- WhatsApp Business digest, extended to reply-to-mark-done (strong India-market differentiator vs. US competitors like Profound/Otterly who don't localize this)
- Regional language tracking beyond Hinglish (Hindi/Devanagari, Tamil, Bengali) as models improve at answering in those languages
- Free public visibility checker as a lead-gen/awareness tool (heavily rate-limited)

**Phase 4 (Moat):**
- Historical dataset becomes valuable on its own — "how has AI visibility shifted industry-wide over 12 months" becomes a sellable report/API
- Category benchmarking matures into a full "how does your category compare" product surface, not just a single comparison bar
- Predictive scoring: model which content changes correlate most strongly with score improvement across your whole customer base (this needs volume — not a v1 concern)

---

## 10. Monetization (India-first framing)

| Plan | Queries | Runs/query | Cadence | Providers | Language | Price angle |
|---|---|---|---|---|---|---|
| Free | 3 | 1 | monthly | Claude + GPT | English only | Lead magnet — show the problem exists |
| Starter | 15 | 3 | weekly | + Gemini + Google AI Overview | + Hinglish | ₹999–1999/mo — solo founders/SMBs |
| Growth | 50 | 3 | weekly/daily hybrid | + Meta AI + Perplexity | + Hindi/Tamil/Bengali | ₹4999–7999/mo — funded startups, D2C brands |
| Agency | multi-brand, white-label | custom | daily | all providers | all languages | Custom pricing — resell to agency's own clients, one workspace across all managed brands |

One account can hold multiple brands regardless of plan (the workspace/brand-switcher is not an Agency-only feature) — what the Agency plan actually adds is white-labeling, per-brand team role assignment, and custom multi-brand billing, not the ability to hold more than one brand.

Sell the diagnostic ("you're invisible to ChatGPT") as the hook, sell the recommendation-tracking loop as the retention mechanism.

---

## 11. Key Risks / Gotchas

- **Non-determinism**: never present a single run as ground truth — always show it as a sampled trend, and say so in the UI ("based on 5 runs this week") to keep the data honest and defensible.
- **API cost creep**: this is the #1 way this SaaS becomes unprofitable if left unmonitored — build cost-per-brand tracking from day 1, not as an afterthought.
- **Attribution ambiguity**: an AI's answer draws from training data + live web retrieval (for models with search) — be honest in the product that "improving your site" won't always move the needle immediately, since some models aren't live-browsing.
- **Provider ToS**: check each provider's terms around automated/bulk querying for a commercial monitoring product before scaling volume — build with reasonable rate limits regardless.
- **Benchmark anonymity**: category benchmark averages must be computed only once enough brands exist in a category (e.g., 10+) — otherwise a small category effectively reveals one competitor's exact score, which is a privacy/trust problem, not just a data one.
- **Free checker cost exposure**: the unauthenticated free visibility checker is a growth hook but also the single easiest target for abuse (scripted repeated calls burning API budget) — rate-limit by IP/email and cap it to a fixed, cheap query set, never the full paid scan.
