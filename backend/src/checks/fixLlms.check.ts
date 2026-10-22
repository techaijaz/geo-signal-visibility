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
    assert.deepEqual(service, [
        home,
        'https://s.in/pages/about',
        'https://s.in/policies/refund-policy',
        'https://s.in/contact',
        'https://s.in/services/root-canal'
    ])
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

    // Footer pages (about, policies, contact) come before collections, blogs and language switches; www matches bare host
    const shopNav = `<a href="/en">EN</a><a href="/collections/a">A</a><a href="/collections/b">B</a><a href="/blogs/news">Blog</a>
        <a href="/collections/c">C</a><a href="/collections/d">D</a><a href="/collections/e">E</a><a href="/collections/f">F</a>
        <footer><a href="https://www.s.in/pages/about">About</a><a href="/policies/refund-policy">Refund</a><a href="/pages/contact">Contact</a></footer>`
    const ranked = siteLinks(shopNav, home)
    assert.deepEqual(ranked.slice(0, 3), ['https://www.s.in/pages/about', 'https://s.in/policies/refund-policy', 'https://s.in/pages/contact'])
    assert.ok(!ranked.includes('https://s.in/en'))
    assert.deepEqual((await llmsUrls(home, [], false, async () => shopNav)).slice(1, 4), ranked.slice(0, 3))

    // A site with many service pages still gets one about, one contact and one policy page (the shortest of each, in page order)
    const clinic = `${['root-canal', 'implants', 'braces', 'dentures', 'aligners', 'crowns', 'whitening']
        .map((t) => `<a href="/dental-treatments/${t}">${t}</a>`)
        .join('')}<a href="/contact/find-clinic">Find</a><a href="/contact/request-an-appointment">Book</a>
        <a href="/about-us">About</a><a href="/terms-privacy-policy">Terms</a><a href="/payment-refund-policy">Refund</a><a href="/contact">Contact</a>`
    const picked = await llmsUrls(home, [], false, async () => clinic)
    assert.deepEqual(picked, [
        home,
        'https://s.in/about-us',
        'https://s.in/terms-privacy-policy',
        'https://s.in/contact',
        'https://s.in/dental-treatments/root-canal',
        'https://s.in/dental-treatments/implants',
        'https://s.in/dental-treatments/braces'
    ])

    // Summary vs link is decided by the heading: a link whose name was cleared keeps its URL
    const edited = fixOutputs({
        type: 'llms',
        title: 'S\n## Fake',
        items: [
            { heading: 'Summary', body: 'Line one.\n## Injected\n- [x](https://evil)' },
            { heading: '## About\nmore', label: '', body: 'Our\nstory', source: 'https://s.in/pages/about us(1)' },
            { heading: 'Contact', label: 'Mail', body: '', source: 'javascript:alert(1)' }
        ]
    }).text
    assert.equal(
        edited,
        [
            '# S ## Fake',
            '',
            '> Line one. ## Injected - [x](https://evil)',
            '',
            '## About more',
            '',
            '- [https://s.in/pages/about us(1)](https://s.in/pages/about%20us%281%29): Our story',
            ''
        ].join('\n')
    )

    // The same page linked twice is kept once
    const twice = parseFixResponse(
        JSON.stringify({
            items: [
                { heading: 'About', label: 'About', body: '', source: 'https://s.in/contact' },
                { heading: 'Contact', label: 'Contact', body: '', source: 'https://s.in/contact' }
            ]
        }),
        'llms',
        ['https://s.in/contact']
    )!
    assert.equal(twice.items.length, 1)

    console.log('fixLlms checks: PASS')
}

run()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
