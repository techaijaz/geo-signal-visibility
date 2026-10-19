/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/fixLlms.check.ts
import assert from 'assert'
import { siteLinks, llmsUrls } from '../service/fix/readPages'
import { buildFixPrompt, parseFixResponse } from '../service/fix/prompt'
import { fixOutputs } from '../service/fix/output'

const run = async () => {
    // Menu and footer pages on the same site; no login, cart, other sites, anchors or files
    const home = 'https://s.in'
    const html = `<nav>
        <a href="/pages/about">About</a><a href="/services/root-canal?ref=nav">Root canal</a><a href="/services/root-canal">dup</a>
        <a href="/account/login">Login</a><a href="/cart">Cart</a><a href="#top">Top</a><a href="mailto:a@s.in">Mail</a>
        <a href="https://instagram.com/s">Insta</a><a href="/brochure.pdf">PDF</a><a href="/">Home</a>
        <a href="/policies/refund-policy">Returns</a><a href="/contact">Contact</a><a href="/products/oud">Oud</a>
    </nav>`
    assert.deepEqual(siteLinks(html, home), [
        'https://s.in/pages/about',
        'https://s.in/services/root-canal',
        'https://s.in/policies/refund-policy',
        'https://s.in/contact'
    ])

    // Pages read: homepage, up to 6 site pages, up to 3 products when the brand sells them
    const fetch = async () => html
    const prods = ['a', 'b', 'c', 'd'].map((x) => ({ title: `Attar ${x}`, url: `https://s.in/products/${x}`, productType: '' }))
    const shop = await llmsUrls(home, prods as never, true, fetch)
    assert.equal(shop[0], home)
    assert.equal(shop.filter((u) => u.includes('/products/')).length, 3)
    assert.ok(shop.length <= 10)
    const service = await llmsUrls(home, prods as never, false, fetch)
    assert.deepEqual(service, [home, ...siteLinks(html, home)])
    // A homepage that can't be read still gives the homepage
    assert.deepEqual(await llmsUrls(home, [], false, async () => Promise.reject(new Error('x'))), [home])

    // Prompt: llms.txt sections, Services for a non-product site, always English
    const pages = [{ url: home, title: 'Sabka Dentist', price: null, rating: null, text: 'Dental clinics in Mumbai' }]
    const svc = buildFixPrompt({ type: 'llms', brandName: 'Sabka Dentist', language: 'hi', questions: [], pages, sellsProducts: false })
    assert.match(svc, /llms\.txt/)
    assert.match(svc, /"Services"/)
    assert.doesNotMatch(svc, /"Products"/)
    assert.match(svc, /Write in English/)
    const shopPrompt = buildFixPrompt({ type: 'llms', brandName: 'Hasan Oud', language: 'en', questions: [], pages, sellsProducts: true })
    assert.match(shopPrompt, /"Products"/)

    // Parse: a link to a page we didn't read is dropped; an unsourced summary is marked
    const raw = JSON.stringify({
        title: 'Sabka Dentist',
        items: [
            { heading: 'Summary', body: 'Dental clinics across Mumbai.', source: home },
            { heading: 'Services', label: 'Root canal', body: 'Painless root canal.', source: 'https://s.in/services/root-canal' },
            { heading: 'Services', label: 'Implants', body: 'Implants.', source: 'https://s.in/made-up' },
            { heading: 'Contact', label: 'Contact', body: '', source: 'https://s.in/contact' },
            { heading: 'Summary', body: 'Open 7 days.' }
        ]
    })
    const parsed = parseFixResponse(raw, 'llms', [home, 'https://s.in/services/root-canal', 'https://s.in/contact'])!
    assert.equal(parsed.title, 'Sabka Dentist')
    assert.deepEqual(parsed.items, [
        { heading: 'Summary', body: 'Dental clinics across Mumbai.', source: home },
        { heading: 'Services', label: 'Root canal', body: 'Painless root canal.', source: 'https://s.in/services/root-canal' },
        { heading: 'Contact', label: 'Contact', body: '', source: 'https://s.in/contact' },
        { heading: 'Summary', body: '[confirm: no source] Open 7 days.' }
    ])
    assert.equal(parseFixResponse(JSON.stringify({ items: [{ heading: 'Services', label: 'X', source: 'https://x.com' }] }), 'llms', [home]), null)

    // Output: llmstxt.org format, sections in the order they first appear
    const out = fixOutputs({ type: 'llms', title: parsed.title, items: parsed.items })
    assert.equal(
        out.text,
        [
            '# Sabka Dentist',
            '',
            '> Dental clinics across Mumbai.',
            '',
            '[confirm: no source] Open 7 days.',
            '',
            '## Services',
            '',
            '- [Root canal](https://s.in/services/root-canal): Painless root canal.',
            '',
            '## Contact',
            '',
            '- [Contact](https://s.in/contact)',
            ''
        ].join('\n')
    )
    assert.equal(out.jsonLd, null)
    assert.match(out.html, /^<pre>/)
    assert.doesNotMatch(fixOutputs({ type: 'llms', title: 'A<b>', items: [] }).html, /<b>/)

    console.log('fixLlms checks: PASS')
}

run()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
