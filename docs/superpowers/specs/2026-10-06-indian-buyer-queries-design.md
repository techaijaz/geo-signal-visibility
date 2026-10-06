# Asli Indian buyer queries (Hinglish + price + occasion) — design

Feature #3 in `COMPETITIVE-FEATURES.md`, section 4, Tier 1 (roadmap: weeks 3–4, next to #1 Lost-to and #4 AI crawler view). Size S–M.

## Decisions (confirmed by the user on 2026-10-06)

1. **Category:** one "Fragrances & Perfumes" category; attar, ittar, oud and deo names match it by keyword. Add it on staging and prod with `npm run seed:categories`.
2. **Suggest with AI:** every plan, 10 calls per brand per day.
3. **Onboarding:** curated lists only; the AI button stays in Settings.
4. **Google autocomplete / People also ask:** not built (terms of service, paid API). Revisit later.
5. **Branded question:** kept, last in each list.

## Goal

When a brand owner picks their questions, they see the questions their buyers actually ask an AI: Hinglish, with a rupee budget, or for an occasion. Not "How to choose the right Fragrances & Perfumes for your needs".

Success: a fragrance brand (Hasan Oud) gets "500 ke andar sabse accha attar", "Shaadi ke liye kaunsa perfume lagayein", "Namaz ke liye alcohol free attar kaunsa accha hai" in onboarding, and "Suggest with AI" in Settings adds 8–12 new, non-duplicate questions of the same kind.

## Non-goals

- Google autocomplete / PAA scraping (open question 4)
- Hindi in Devanagari, Tamil, Bengali queries (the Settings panel already shows them as "Upgrade to enable")
- Product-level (SKU) questions: feature #2
- Search volume or "how many people ask this"

## 1. Curated templates (backend, no AI)

**New:** `backend/src/service/querySuggestionService.ts`

- `detectVertical(category: string): Vertical` maps a category name to a vertical by keyword, so admin-made categories ("Fragrances & Perfumes", "Attar", "Perfume & Deo") still match. Verticals: `fragrance, skincare, beauty, fashion, jewellery, food, wellness, baby, home, electronics, pet`, the old non-D2C presets (`saas, fintech, edtech, healthtech, ai`), and `generic`.
- `templateQueries(category: string, brandName?: string): ISuggestedQuery[]` returns that vertical's list (10–12 questions). Each item: `{ text, lang: 'EN' | 'HI-EN', intent }`. Intents gain **`Price`** and **`Occasion`** next to `Best-of`, `Comparison`, `Direct`, `How-to`.
- **Order matters**, because onboarding pre-ticks only the first `maxQueries` (Free = 3): 1st a Hinglish price question, 2nd a Hinglish occasion question, 3rd an English best-of. The branded question is last.
- `generic` uses the category name as the noun ("1000 ke andar sabse accha {category}", "Gift ke liye best {category} under ₹1500"). No "How to choose the right … for your needs".
- The old non-D2C presets (SaaS, FinTech, EdTech, HealthTech, AI) move over unchanged, minus the generic how-to lines.
- The scan's own fallback (used only when a brand has no enabled queries) uses `templateQueries` for e-commerce brands instead of "Best value {category} products".

**API:** `GET /queries/templates?category=&brand=` (authenticated) → `{ vertical, queries }`. No AI, no DB.

## 2. AI suggestions

`suggestQueries(brand, existing: string[]): Promise<ISuggestedQuery[]>` in the same service.

- One call through `aiService.callAnyAvailableAi` (cheapest available model first) inside `withAiCallContext({ brandId, purpose: 'queries' })`, so cost shows on the Cost Logs page under a new purpose `'queries'`.
- The prompt gives the brand name, website, category, region (India) and 3 template examples, and asks for 12 questions Indian shoppers type into ChatGPT/Gemini **without the brand name**: a mix of Hinglish (Roman script) and English, rupee budgets, occasions (shaadi, Eid, Diwali, office, gifting, gym, garmi), and problem-based questions. JSON only: `[{ "text", "lang", "intent" }]`.
- **Validation (the AI is not trusted)**, pure `cleanSuggestions(raw, brandName, existing)`:
  - Strips numbering, quotes and trailing junk; keeps 3–20 words and at most 140 characters; drops URLs.
  - Drops questions containing the brand name (they measure recall, not discovery).
  - De-duplicates case- and punctuation-insensitively, against each other and against `existing` (the brand's current queries).
  - `lang` must be `EN` or `HI-EN`, else it is detected (`detectLang`: Hinglish marker words such as "ke liye", "sabse", "accha", "kaunsa", "andar"). `intent` outside the allowed set becomes `Price` when the text has ₹/"under"/"ke andar", else `Best-of`.
  - Caps at 12.
- **Cap:** at most 10 AI suggestion calls per brand per rolling 24 hours, counted from cost-log rows with `purpose: 'queries'`. That count survives restarts and works across processes. Over the cap → 429 "You can ask for AI suggestions 10 times a day. Try again tomorrow."

**API:** `POST /brands/:id/query-suggestions` (authenticated, brand must belong to the user's org, same check as `/lost-to`). Body: none; existing queries are read from the saved brand plus an optional `existing: string[]` for unsaved edits. Returns `{ queries }`. No AI key or broken JSON → 200 with `queries: []` and `message: "AI suggestions are not available right now."`.

Suggestions are **not saved**: the user ticks what they want and saves as today (plan limit enforced by `PATCH /brands/:id` as today).

## 3. Screens

**Onboarding, step 3 "Pick what to track":** the list comes from `GET /queries/templates` when the user reaches step 3 or changes category/brand (instead of the frontend generator). Sub-text: "Questions Indian shoppers ask AI, in Hinglish and English, with budgets and occasions." Price and Occasion get their own tag colours. If the call fails: "Couldn't load suggestions. Add your own below or try ↻ Reset."

**Settings → Tracked queries:**
- "+ Auto-suggest {category} queries" uses the same API (adds the templates not already present, up to the plan limit, as today).
- New button **"✨ Suggest with AI"**: calls `POST /brands/:id/query-suggestions` and shows the results in a small list under the button, each with **Add** (disabled at the plan limit). Added ones disappear from the list. A note: "AI ideas from your category. Pick the ones your buyers would really ask."

`frontend/src/utils/categoryQueryGenerator.ts` is deleted: the backend is the one source of templates.

## Error handling

- AI returns junk / no key: empty list plus the message above; nothing is saved; no cost.
- AI returns the brand name, duplicates, or 40-word essays: dropped by `cleanSuggestions`.
- Over the daily cap: 429 with the message; the button shows it.
- Templates endpoint never calls AI and cannot fail on AI.

## Testing

- **Check script** `backend/src/checks/indianQueries.check.ts` (no DB, no real AI; `callAnyAvailableAi` is stubbed):
  - `detectVertical`: "Fragrances & Perfumes", "Attar", "Perfume & Deo" → fragrance; "SaaS & Software" → saas; "Other / General" → generic.
  - `templateQueries`: fragrance list has a Hinglish Price and Hinglish Occasion question in the first 3, contains the three example questions, has no "for your needs", has unique texts, puts the branded question last; generic list uses the category name and has no "for your needs".
  - `detectLang` and `cleanSuggestions`: brand name, duplicates (also vs existing), URLs, too long/too short dropped; bad lang/intent repaired; cap 12; non-array input → [].
  - `suggestQueries` with a stubbed AI: good JSON → cleaned list; broken JSON / null → [].
- **Build:** `npx tsc --noEmit -p .` and eslint (backend), `npm run build` (frontend).
- **Browser (later, with email off):** onboarding step 3 for a fragrance category shows the Hinglish list; Settings "Suggest with AI" adds a question; at the plan limit Add is disabled.
- **Test Sheet:** feature "N4 · Indian buyer queries" with positive and negative cases after the staging deploy.
