# Lost-to List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show which brands the AI engines recommend instead of the user's brand: an Overview card and a Competitors section with a one-click Track button.

**Architecture:** After each scan, one cheap AI call per 10 answers extracts brand names. Names are validated against the answer text, positions come from the text, and the result is saved on each mention as `brandsNamed`. A pure aggregation (`computeLostTo`) behind `GET /brands/:id/lost-to` feeds a shared React component file used by Overview and Competitors.

**Tech Stack:** Express + Mongoose (TypeScript, ts-node), React 19 + Vite, existing `aiService.callAnyAvailableAi`.

**Spec:** `docs/superpowers/specs/2026-10-05-lost-to-list-design.md`

## Global Constraints

- No new dependencies.
- The backend has no test runner: checks are `assert` scripts under `backend/src/checks/`, run with `NODE_ENV=development npx ts-node --transpile-only src/checks/<file>.ts`. They must not call real AI providers (mock `fetch`) and must end with `process.exit(0)`.
- Local runs: start the backend with `SMTP_USER= SMTP_PASS= EMAIL_SERVICE_API_KEY= RESEND_API_KEY=` so no real email is sent. Before registering any user, check that a resend request logs "EMAIL NOT SENT".
- Extraction failure must never fail a scan.
- Positions use the existing scan rule (`positionIn`: list number, else line number, max 5).
- Commits under the user's name, no Claude trailers.

## Review Focus

- The AI returns a name that is not in the answer (hallucinated) → dropped (Task 1 check).
- The AI returns the user's own brand, or the same brand twice in different case → own brand dropped, duplicates merged (Task 1 check).
- One chunk returns broken JSON → only that chunk's answers get `[]`; other chunks are kept (Task 1 check).
- A brand name that is a substring of another word ("Glow" in "Glowleaf") → not counted (Task 1 check uses `nameMatcher`).
- The brand is at its competitor limit and Track is clicked → the server's limit message is shown and the list is unchanged (Task 4 browser check).

---

### Task 1: Brand extraction service

**Files:**
- Modify: `backend/src/service/competitorService.ts` (export `nameMatcher`, `positionIn`)
- Modify: `backend/src/model/mentionModel.ts` (add `brandsNamed`)
- Modify: `backend/src/types/mentionTypes.ts` (add `brandsNamed?`)
- Modify: `backend/src/model/costLogModel.ts`, `backend/src/service/costLogService.ts` (purpose `'brands'`)
- Create: `backend/src/service/brandExtractionService.ts`
- Create: `backend/src/checks/lostTo.check.ts`

**Interfaces:**
- Produces: `validateNames(names: unknown, text: string, ownBrand: string): IBrandNamed[]`; `extractBrands(answers: { id: string; text: string }[], ownBrand: string): Promise<Map<string, IBrandNamed[]>>`; `interface IBrandNamed { name: string; position: number | null }` (exported from `mentionTypes.ts`).

- [ ] **Step 1: Write the failing check**

`backend/src/checks/lostTo.check.ts`:
```ts
/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/lostTo.check.ts
import assert from 'assert'
import mongoose from 'mongoose'
import config from '../config/config'
import databseService from '../service/databseService'
import { validateNames, extractBrands } from '../service/brandExtractionService'

const answer = '1. **Ajmal Dahn Al Oudh** - long lasting\n2. Fogg Scent - budget\n3. Hasan Oud Silk\nAlso try Glowleaf.'

;(async () => {
    // Cost logs are written for each mocked AI call, so the DB must be up
    await mongoose.connect(config.DATABASE_URL as string)
    // validateNames: invented, own brand, duplicates and substrings are dropped; position from the text
    assert.deepStrictEqual(validateNames(['Ajmal', 'ajmal', 'Hasan Oud', 'Rasasi', 'Glow', 'Fogg'], answer, 'Hasan Oud'), [
        { name: 'Ajmal', position: 1 },
        { name: 'Fogg', position: 2 }
    ])
    assert.deepStrictEqual(validateNames('not an array', answer, 'X'), [])

    // extractBrands: chunk 1 good, chunk 2 broken JSON
    ;(databseService as unknown as { getDecryptedApiKey: () => Promise<string> }).getDecryptedApiKey = async () => 'k'
    let call = 0
    globalThis.fetch = (async () => {
        call++
        const text = call === 1 ? JSON.stringify(Object.fromEntries([...Array(10)].map((_, i) => [String(i), ['Ajmal', 'Invented']]))) : 'sorry, no json'
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 })
    }) as typeof fetch
    const answers = [...Array(12)].map((_, i) => ({ id: 'a' + i, text: answer }))
    const out = await extractBrands(answers, 'Hasan Oud')
    assert.deepStrictEqual(out.get('a0'), [{ name: 'Ajmal', position: 1 }])
    assert.deepStrictEqual(out.get('a11'), [])
    assert.equal(out.size, 12)
    console.log('lost-to checks: PASS')
    await mongoose.disconnect()
    process.exit(0)
})().catch((e) => {
    console.error(e)
    process.exit(1)
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd backend && NODE_ENV=development npx ts-node --transpile-only src/checks/lostTo.check.ts`
Expected: fails with "Cannot find module '../service/brandExtractionService'".

- [ ] **Step 3: Export the helpers and add the types**

In `competitorService.ts`, change `const nameMatcher =` to `export const nameMatcher =` and `const positionIn =` to `export const positionIn =`.

In `mentionTypes.ts`, add:
```ts
export interface IBrandNamed {
    name: string
    position: number | null
}
```
and the field `brandsNamed?: IBrandNamed[]` to `IMention`.

In `mentionModel.ts`, add to the schema (after `rawText`):
```ts
        // Other brands this answer recommends (unset = not extracted yet, [] = none found)
        brandsNamed: {
            type: [new mongoose.Schema({ name: String, position: Number }, { _id: false })],
            default: undefined
        },
```

In `costLogModel.ts`, change the purpose enum to `['scan', 'recommendations', 'brands']`. In `costLogService.ts`, change the purpose type to `'scan' | 'recommendations' | 'brands'`.

- [ ] **Step 4: Write the service**

`backend/src/service/brandExtractionService.ts`:
```ts
// Brand names an AI answer recommends, for the lost-to list. One cheap AI call per 10 answers;
// the AI only proposes names, the answer text decides what is kept and where it sits.
import aiService from './aiService'
import { nameMatcher, positionIn } from './competitorService'
import { IBrandNamed } from '../types/mentionTypes'
import logger from '../util/loger'

const CHUNK = 10

export const validateNames = (names: unknown, text: string, ownBrand: string): IBrandNamed[] => {
    if (!Array.isArray(names)) return []
    const own = ownBrand.trim().toLowerCase()
    const seen = new Set<string>()
    const out: IBrandNamed[] = []
    for (const raw of names) {
        if (typeof raw !== 'string') continue
        const name = raw.replace(/\s+/g, ' ').trim()
        const key = name.toLowerCase()
        if (!name || key === own || seen.has(key)) continue
        const re = nameMatcher(name)
        if (!re.test(text)) continue
        seen.add(key)
        out.push({ name, position: positionIn(text, re) })
    }
    return out
}

const promptFor = (texts: string[]) => `For each numbered answer below, list the brand or company names it recommends or mentions.
Use the short brand name ("Ajmal", not "Ajmal Dahn Al Oudh"). Do not list product names, shops or generic words.
Reply with JSON only: {"0": ["Brand", ...], "1": [...], ...}. Use [] when an answer names no brand.

${texts.map((t, i) => `### ${i}\n${t.slice(0, 3000)}`).join('\n\n')}`

const parseJson = (s: string | null): Record<string, unknown> | null => {
    if (!s) return null
    try {
        const match = s.match(/\{[\s\S]*\}/)
        return JSON.parse(match ? match[0] : s)
    } catch {
        return null
    }
}

export const extractBrands = async (answers: { id: string; text: string }[], ownBrand: string) => {
    const result = new Map<string, IBrandNamed[]>()
    for (let i = 0; i < answers.length; i += CHUNK) {
        const chunk = answers.slice(i, i + CHUNK)
        const parsed = parseJson(await aiService.callAnyAvailableAi(promptFor(chunk.map((a) => a.text)), 1500))
        if (!parsed) logger.warn(`[brandExtraction] No usable JSON for answers ${i}-${i + chunk.length - 1}`)
        chunk.forEach((a, j) => result.set(a.id, validateNames(parsed?.[String(j)], a.text, ownBrand)))
    }
    return result
}
```

- [ ] **Step 5: Run the check and see it pass**

Run: `cd backend && NODE_ENV=development npx ts-node --transpile-only src/checks/lostTo.check.ts`
Expected: `lost-to checks: PASS`. Also run `npx tsc --noEmit -p .` and `npx eslint src/service/brandExtractionService.ts src/checks/lostTo.check.ts`, both clean.

- [ ] **Step 6: Commit**

```bash
git add backend/src
git commit -m "feat(lost-to): extract brand names from AI answers"
```

### Task 2: Run extraction after each scan, and backfill older scans

**Files:**
- Modify: `backend/src/service/brandExtractionService.ts` (add `saveBrandsNamed`)
- Modify: `backend/src/service/aiService.ts` (call it after `insertMany`)
- Modify: `backend/src/checks/lostTo.check.ts`

**Interfaces:**
- Consumes: `extractBrands` (Task 1).
- Produces: `saveBrandsNamed(mentions: Array<{ _id: unknown; rawText?: string }>, ownBrand: string): Promise<void>`, which writes `brandsNamed` on each mention with `rawText` and never throws.

- [ ] **Step 1: Add the failing check** (append before `console.log('lost-to checks: PASS')`)

```ts
    // saveBrandsNamed writes to the DB; when every provider fails it writes [] and does not throw
    const mentionModel = (await import('../model/mentionModel')).default
    const { saveBrandsNamed } = await import('../service/brandExtractionService')
    const brandId = new mongoose.Types.ObjectId()
    const [m] = await mentionModel.insertMany([{ brandId, queryText: 'q', model: 'ChatGPT', mentioned: false, position: null, sentiment: 'Neutral', rawText: answer, extractedAt: new Date() }])
    call = 0
    await saveBrandsNamed([m], 'Hasan Oud')
    const saved = await mentionModel.findById(m._id).lean()
    assert.deepStrictEqual(saved?.brandsNamed, [{ name: 'Ajmal', position: 1 }])
    // 400 is not retried, so every provider fails fast
    globalThis.fetch = (async () => new Response('bad key', { status: 400 })) as typeof fetch
    await saveBrandsNamed([m], 'Hasan Oud')
    assert.deepStrictEqual((await mentionModel.findById(m._id).lean())?.brandsNamed, [])
    await mentionModel.deleteMany({ brandId })
```

- [ ] **Step 2: Run it and see it fail** ("saveBrandsNamed is not a function")

- [ ] **Step 3: Implement**

Append to `brandExtractionService.ts`:
```ts
import mentionModel from '../model/mentionModel'

// Never throws: a failed extraction leaves brandsNamed unset and the scan stands
export const saveBrandsNamed = async (mentions: Array<{ _id: unknown; rawText?: string }>, ownBrand: string) => {
    try {
        const withText = mentions.filter((m) => m.rawText)
        if (!withText.length) return
        const found = await extractBrands(withText.map((m) => ({ id: String(m._id), text: m.rawText as string })), ownBrand)
        await mentionModel.bulkWrite(
            withText.map((m) => ({ updateOne: { filter: { _id: m._id }, update: { $set: { brandsNamed: found.get(String(m._id)) ?? [] } } } }))
        )
    } catch (error) {
        logger.warn('[brandExtraction] Failed, brand names skipped for this scan', { meta: error })
    }
}
```
(Move the `mentionModel` import to the top with the others.)

In `aiService.ts`, inside `scanMentionsWithAi` right after `const inserted = await mentionModel.insertMany(...)`:
```ts
        // Who AI recommends instead of the brand (lost-to list); never fails the scan
        await withAiCallContext({ brandId, purpose: 'brands' }, () => saveBrandsNamed(inserted, brandName))
```
and import `saveBrandsNamed` from `./brandExtractionService`.

- [ ] **Step 4: Run the check, `tsc --noEmit` and eslint; all pass**

- [ ] **Step 5: Commit** `feat(lost-to): extract brand names after every scan`

### Task 3: Aggregation and API

**Files:**
- Modify: `backend/src/service/competitorService.ts` (add `computeLostTo`)
- Modify: `backend/src/controller/brandController.ts` (add `getLostTo`)
- Modify: `backend/src/router/apiRouter.ts`
- Modify: `backend/src/checks/lostTo.check.ts`

**Interfaces:**
- Consumes: `IMention.brandsNamed`, `saveBrandsNamed`.
- Produces: `computeLostTo(mentions: IMention[], brandName: string, tracked: string[], recs: Array<{ _id: unknown; text: string }>): ILostTo`, and `GET /brands/:id/lost-to` returning `{ ...ILostTo, trackedCompetitors: { name: string; website?: string }[] }` where
```ts
export interface ILostTo {
    totalAnswers: number
    extracted: boolean
    you: { named: number; bestPosition: number | null; closestWin: { queryText: string; model: string; position: number } | null }
    brands: Array<{ name: string; answers: number; avgPosition: number | null; aheadOfYou: number; tracked: boolean }>
    byQuestion: Array<{ queryText: string; rows: Array<{ model: string; you: number | null; others: IBrandNamed[] }> }>
    topActions: Array<{ _id: string; text: string }>
}
```

- [ ] **Step 1: Add the failing check** (in the same script, before the final PASS line)

```ts
    const { computeLostTo } = await import('../service/competitorService')
    const ms = [
        { queryText: 'q1', model: 'ChatGPT', mentioned: false, position: null, brandsNamed: [{ name: 'Ajmal', position: 1 }, { name: 'Fogg', position: 2 }] },
        { queryText: 'q1', model: 'Gemini', mentioned: true, position: 3, brandsNamed: [{ name: 'ajmal', position: 1 }] },
        { queryText: 'q2', model: 'ChatGPT', mentioned: true, position: 1, brandsNamed: [{ name: 'Ajmal', position: 2 }] }
    ] as never[]
    const lt = computeLostTo(ms, 'Hasan Oud', ['Fogg'], [{ _id: 'r1', text: 'Add FAQ' }])
    assert.equal(lt.totalAnswers, 3)
    assert.equal(lt.extracted, true)
    assert.deepStrictEqual(lt.brands[0], { name: 'Ajmal', answers: 3, avgPosition: 1.3, aheadOfYou: 2, tracked: false })
    assert.equal(lt.brands[1].tracked, true)
    assert.deepStrictEqual(lt.you, { named: 2, bestPosition: 1, closestWin: { queryText: 'q2', model: 'ChatGPT', position: 1 } })
    assert.equal(lt.byQuestion[0].rows[0].others.length, 2)
    assert.equal(computeLostTo([{ ...ms[0], brandsNamed: undefined }] as never[], 'X', [], []).extracted, false)
    assert.equal(computeLostTo([ms[0]] as never[], 'Hasan Oud', [], [{ _id: 'r1', text: 'Add FAQ' }]).topActions.length, 1)
```

- [ ] **Step 2: Run it and see it fail** ("computeLostTo is not a function")

- [ ] **Step 3: Implement `computeLostTo`** in `competitorService.ts`:

```ts
// Who the AI recommends instead of the brand, from one scan's answers (lost-to list)
export const computeLostTo = (
    mentions: IMention[],
    brandName: string,
    tracked: string[],
    recs: Array<{ _id: unknown; text: string }>
): ILostTo => {
    const extracted = mentions.some((m) => Array.isArray(m.brandsNamed))
    const trackedSet = new Set(tracked.map((t) => t.trim().toLowerCase()))
    const byName = new Map<string, { name: string; positions: number[]; answers: number; ahead: number }>()
    for (const m of mentions) {
        for (const b of m.brandsNamed || []) {
            const key = b.name.toLowerCase()
            const row = byName.get(key) || { name: b.name, positions: [], answers: 0, ahead: 0 }
            row.answers++
            if (b.position) row.positions.push(b.position)
            if (!m.mentioned || (b.position !== null && m.position !== null && b.position < m.position)) row.ahead++
            byName.set(key, row)
        }
    }
    const brands = [...byName.values()]
        .map((r) => ({ name: r.name, answers: r.answers, avgPosition: average(r.positions), aheadOfYou: r.ahead, tracked: trackedSet.has(r.name.toLowerCase()) }))
        .sort((a, b) => b.answers - a.answers || (a.avgPosition ?? 99) - (b.avgPosition ?? 99))
        .slice(0, 20)

    const named = mentions.filter((m) => m.mentioned)
    const best = named.filter((m) => m.position).sort((a, b) => (a.position as number) - (b.position as number))[0]
    const questions = new Map<string, ILostTo['byQuestion'][number]>()
    for (const m of mentions) {
        const q = questions.get(m.queryText) || { queryText: m.queryText, rows: [] }
        q.rows.push({ model: m.model, you: m.mentioned ? m.position : null, others: m.brandsNamed || [] })
        questions.set(m.queryText, q)
    }
    return {
        totalAnswers: mentions.length,
        extracted,
        you: {
            named: named.length,
            bestPosition: best ? (best.position as number) : null,
            closestWin: best ? { queryText: best.queryText, model: best.model, position: best.position as number } : null
        },
        brands,
        byQuestion: [...questions.values()],
        topActions: recs.slice(0, 3).map((r) => ({ _id: String(r._id), text: r.text }))
    }
}
```
Add the `ILostTo` interface (from Interfaces above) and import `IBrandNamed` at the top of the file. Name `brandName` is kept for future use; prefix it as `_brandName` if eslint flags it.

- [ ] **Step 4: Controller and route**

In `brandController.ts`, add after `getCompetitorComparison`:
```ts
    getLostTo: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id } = req.params
            const orgId = await ensureUserOrg(authenticatedUser._id.toString(), authenticatedUser.name)
            const brand = await databseService.findBrandByIdAndOrgId(id, orgId)
            if (!brand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }
            let { current } = await loadScanPair(id, brand.lastScanId)
            // Scans from before this feature: extract once and keep the result
            if (current.some((m) => m.rawText) && !current.some((m) => Array.isArray(m.brandsNamed))) {
                await withAiCallContext({ brandId: id, purpose: 'brands' }, () => saveBrandsNamed(current as never[], brand.name))
                current = (await loadScanPair(id, brand.lastScanId)).current
            }
            const recs = await recommendationModel
                .find({ brandId: id, isCompleted: { $ne: true }, impact: 'High impact' })
                .select('text')
                .limit(3)
                .lean()
            const competitors = brand.competitors || []
            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                ...computeLostTo(current, brand.name, competitors.map((c) => c.name), recs),
                trackedCompetitors: competitors.map((c) => ({ name: c.name, website: c.website || '' }))
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },
```
Imports: `computeLostTo` (next to `computeCompetitorStats`), `saveBrandsNamed` from `../service/brandExtractionService`, `withAiCallContext` from `../service/costLogService`, `recommendationModel` from `../model/recommendationModel`.

In `apiRouter.ts`, after the `competitors/compare` line:
```ts
router.route('/brands/:id/lost-to').get(authentication, brandController.getLostTo)
```

- [ ] **Step 5: Run the check, `tsc --noEmit` and eslint; all pass**

- [ ] **Step 6: Commit** `feat(lost-to): lost-to API from the latest scan`

### Task 4: Overview card with Track

**Files:**
- Create: `frontend/src/components/LostTo.tsx` (shared hook + `LostToCard` + `LostToSection`)
- Modify: `frontend/src/pages/Overview.tsx`

**Interfaces:**
- Consumes: `GET /brands/:id/lost-to`, existing `PATCH /brands/:id` with `{ competitors }`.
- Produces: `export function LostToCard({ brandId }: { brandId?: string })` and `export function LostToSection({ brandId }: { brandId?: string })` (the section is used in Task 5).

- [ ] **Step 1: Write the component file**

`frontend/src/components/LostTo.tsx`:
```tsx
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/axios';

interface BrandRow { name: string; answers: number; avgPosition: number | null; aheadOfYou: number; tracked: boolean }
interface Named { name: string; position: number | null }
interface LostTo {
  totalAnswers: number;
  extracted: boolean;
  you: { named: number; bestPosition: number | null; closestWin: { queryText: string; model: string; position: number } | null };
  brands: BrandRow[];
  byQuestion: Array<{ queryText: string; rows: Array<{ model: string; you: number | null; others: Named[] }> }>;
  topActions: Array<{ _id: string; text: string }>;
  trackedCompetitors: Array<{ name: string; website?: string }>;
}

function useLostTo(brandId?: string) {
  const [data, setData] = useState<LostTo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!brandId) return;
    try {
      const res = await api.get(`/brands/${brandId}/lost-to`);
      setData(res.data?.data ?? null);
    } catch {
      setData(null);
    }
  }, [brandId]);
  useEffect(() => { load(); }, [load]);

  const track = async (name: string) => {
    if (!brandId || !data) return;
    setError(null);
    try {
      await api.patch(`/brands/${brandId}`, { competitors: [...data.trackedCompetitors, { name }] });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not add this competitor.');
    }
  };
  return { data, error, track };
}

const pos = (p: number | null) => (p ? `#${p}` : '—');

function BrandRows({ rows, total, track, full }: { rows: BrandRow[]; total: number; track: (n: string) => void; full?: boolean }) {
  return (
    <table>
      <thead>
        <tr><th>Brand</th><th>Answers</th><th>Avg position</th>{full && <th>Ahead of you</th>}<th></th></tr>
      </thead>
      <tbody>
        {rows.map((b) => (
          <tr key={b.name}>
            <td style={{ fontWeight: 600 }}>{b.name}</td>
            <td className="mono">{b.answers}/{total}</td>
            <td className="mono">{b.avgPosition ? `#${b.avgPosition}` : '—'}</td>
            {full && <td className="mono">{b.aheadOfYou}</td>}
            <td style={{ textAlign: 'right' }}>
              {b.tracked
                ? <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>tracked</span>
                : <button type="button" className="btn" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => track(b.name)}>Track</button>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Notes({ data, brandName }: { data: LostTo; brandName?: string }) {
  if (data.you.named === 0) {
    return (
      <div style={{ fontSize: '13.5px', margin: '4px 0 12px' }}>
        None of the {data.totalAnswers} answers named {brandName || 'your brand'}. That is common for newer brands: AI recommends brands it has read about in many places.
        {data.topActions.length > 0 && (
          <> Start with:
            <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
              {data.topActions.map((a) => <li key={a._id}><Link to="/recommendations">{a.text}</Link></li>)}
            </ul>
          </>
        )}
      </div>
    );
  }
  const w = data.you.closestWin;
  return w ? <p className="sub" style={{ margin: '4px 0 12px' }}>{w.model} named you #{w.position} for “{w.queryText}”.</p> : null;
}

export function LostToCard({ brandId, brandName }: { brandId?: string; brandName?: string }) {
  const { data, error, track } = useLostTo(brandId);
  if (!data || data.totalAnswers === 0) return null;
  return (
    <div className="panel">
      <h3>AI is recommending instead of you</h3>
      {!data.extracted || data.brands.length === 0 ? (
        <p className="sub">{data.extracted ? 'No other brands were named in the last scan.' : 'Brand names will appear after the next scan.'}</p>
      ) : (
        <>
          <Notes data={data} brandName={brandName} />
          {error && <p style={{ color: 'var(--bad)', fontSize: '13px' }}>{error}</p>}
          <div style={{ overflowX: 'auto' }}><BrandRows rows={data.brands.slice(0, 5)} total={data.totalAnswers} track={track} /></div>
          <div style={{ textAlign: 'right', marginTop: '10px', fontSize: '13px' }}><Link to="/competitors#lost-to">See every question →</Link></div>
        </>
      )}
    </div>
  );
}

export function LostToSection({ brandId, brandName }: { brandId?: string; brandName?: string }) {
  const { data, error, track } = useLostTo(brandId);
  if (!data || data.totalAnswers === 0) return null;
  return (
    <div className="panel" id="lost-to">
      <h3>Brands AI names instead of you</h3>
      {!data.extracted || data.brands.length === 0 ? (
        <p className="sub">{data.extracted ? 'No other brands were named in the last scan.' : 'Brand names will appear after the next scan.'}</p>
      ) : (
        <>
          <Notes data={data} brandName={brandName} />
          {error && <p style={{ color: 'var(--bad)', fontSize: '13px' }}>{error}</p>}
          <div style={{ overflowX: 'auto' }}><BrandRows rows={data.brands} total={data.totalAnswers} track={track} full /></div>
          <h3 style={{ marginTop: '24px' }}>By question</h3>
          {data.byQuestion.map((q) => (
            <div key={q.queryText} style={{ marginTop: '12px' }}>
              <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{q.queryText}</div>
              {q.rows.map((r) => (
                <div key={r.model} className="mono" style={{ fontSize: '12.5px', color: 'var(--text-dim)' }}>
                  {r.model}: You {pos(r.you)}{r.others.length ? ' · ' + r.others.map((o) => `${o.name} ${pos(o.position)}`).join(', ') : ''}
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Place the card on Overview**

In `Overview.tsx`: `import { LostToCard } from '../components/LostTo';` and insert directly above `{/* Model Visibility & Sentiment Matrix Table */}`:
```tsx
      <LostToCard brandId={activeBrandId} brandName={data?.brandName} />
```

- [ ] **Step 3: Build** — `cd frontend && npm run build` passes; `npx oxlint src/components/LostTo.tsx src/pages/Overview.tsx` shows no new warnings.

- [ ] **Step 4: Commit** `feat(lost-to): Overview card with Track`

### Task 5: Competitors section and Settings line

**Files:**
- Modify: `frontend/src/pages/Competitors.tsx`
- Modify: `frontend/src/pages/Settings.tsx`

- [ ] **Step 1: Competitors** — `import { LostToSection } from '../components/LostTo';` and insert before the page's closing `</div>` (after the Head-to-head panel):
```tsx
      <LostToSection brandId={activeBrandId} brandName={context?.currentBrand?.name} />
```
If the page shows a loading/empty early return, keep the section out of it; it handles its own empty state.

- [ ] **Step 2: Settings** — under the queries "Plan Allowance" line, add:
```tsx
              <p className="sub" style={{ marginTop: '8px' }}>
                Changing questions changes what we measure, not what AI knows about you. Fixes on your site and mentions elsewhere move it, usually within 2–6 weeks.
              </p>
```

- [ ] **Step 3: Build and lint as in Task 4**

- [ ] **Step 4: Commit** `feat(lost-to): Competitors section and Settings note`

### Task 6: Browser check, PR, staging, Test Sheet

- [ ] **Step 1:** Start the backend with email off and confirm "EMAIL NOT SENT". Register `lostto-test@example.com`, confirm it in the DB, set its org to `growth`, and insert a brand with a `lastScanId`, 6 mentions sharing that `scanId` (with `rawText` and `brandsNamed`, one mention with `mentioned: true, position: 4`), and 3 High-impact open recommendations.
- [ ] **Step 2:** In Playwright, check:
  - The Overview card shows rows in the right order with "n/6".
  - Track on an untracked brand turns into "tracked" and the brand appears in `brand.competitors`.
  - The closest-win line is right.
  - With every mention set to `mentioned: false`, the zero state lists the 3 actions.
  - Competitors `#lost-to` shows "By question" lines.
  - With competitors already at the plan limit, Track shows the server's limit message.
  - With `brandsNamed` unset on all mentions and the AI mocked through a route-intercepted backend call (or skipped), the card says "Brand names will appear after the next scan".
- [ ] **Step 3:** Delete the test data and stop all node processes. Push the branch and open the PR. Wait for green checks (`gh pr checks N --watch`), then hand the merge command to the user.
- [ ] **Step 4:** After the merge: wait for the Images run, deploy to staging with the merge SHA, and add Test Sheet feature `N3` with positive and negative cases.
