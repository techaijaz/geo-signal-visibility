/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/lostToNames.check.ts
import assert from 'assert'
import { positionIn, nameMatcher, computeLostTo, isNotBrand } from '../service/competitorService'
import { validateNames } from '../service/brandExtractionService'
import aiService from '../service/aiService'

// 1. List numbers behind markdown, and lines inside a numbered item
const md = [
    'Here are some great options:',
    '',
    '**1. Ajmal** - long lasting',
    '### 2. Adil Qadri',
    '- **3.** Al-Rehab Choco Musk',
    '4\\. Fogg',
    '5. Best budget pick',
    '   **Engage** is cheap',
    '',
    'In short, buy any of these.'
].join('\n')
assert.equal(positionIn(md, nameMatcher('Ajmal')), 1)
assert.equal(positionIn(md, nameMatcher('Adil Qadri')), 2)
assert.equal(positionIn(md, nameMatcher('Al-Rehab')), 3)
assert.equal(positionIn(md, nameMatcher('Fogg')), 4)
assert.equal(positionIn(md, nameMatcher('Engage')), 5)
assert.equal(positionIn('Intro line\nDenver is good', nameMatcher('Denver')), 2)
assert.equal(aiService.parseMentionFromText('Top picks:\n**1. Hasan Oud** - great', 'Hasan Oud').position, 1)

// 2 + 3. Spelling variants are one brand; shops and marketplaces are not brands
const text = 'Try AdilQadri or Adil Qadri, Al Rehab, Al-Rehab, Nykaa, Amazon and HasanOud.'
assert.deepStrictEqual(
    validateNames(['AdilQadri', 'Adil Qadri', 'Al Rehab', 'Al-Rehab', 'Nykaa', 'Amazon', 'HasanOud'], text, 'Hasan Oud').map((b) => b.name),
    ['AdilQadri', 'Al Rehab']
)

// Older scans already saved with variants and shops: merged and dropped when listed
const ms = [
    {
        queryText: 'q1',
        model: 'ChatGPT',
        mentioned: false,
        position: null,
        brandsNamed: [
            { name: 'Adil Qadri', position: 1 },
            { name: 'Nykaa', position: 2 }
        ]
    },
    { queryText: 'q1', model: 'Gemini', mentioned: false, position: null, brandsNamed: [{ name: 'AdilQadri', position: 3 }] },
    { queryText: 'q2', model: 'Claude', mentioned: false, position: null, brandsNamed: [{ name: 'Adil Qadri', position: 2 }] }
] as never[]
const lt = computeLostTo(ms, 'Hasan Oud', ['adilqadri'], [])
assert.deepStrictEqual(lt.brands, [{ name: 'Adil Qadri', answers: 3, avgPosition: 2, aheadOfYou: 3, tracked: true }])
assert.deepStrictEqual(
    lt.byQuestion[0].rows[0].others.map((o) => o.name),
    ['Adil Qadri']
)

// Positions of older scans are read again from the answer text
const old = [
    { queryText: 'q', model: 'ChatGPT', mentioned: false, position: null, rawText: md, brandsNamed: [{ name: 'Ajmal', position: 5 }] }
] as never[]
assert.equal(computeLostTo(old, 'Hasan Oud', [], []).brands[0].avgPosition, 1)

// Staging: review sites are not brands, misspelled or not
assert.equal(isNotBrand('Fragrantica'), true)
assert.equal(isNotBrand('Fragnatica'), true)
assert.equal(isNotBrand('Basenotes'), true)

console.log('lost-to names checks: PASS')
process.exit(0)
