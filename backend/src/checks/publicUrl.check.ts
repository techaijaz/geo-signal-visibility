/* eslint-disable no-console */
// Run: NODE_ENV=development npx ts-node --transpile-only src/checks/publicUrl.check.ts
import assert from 'assert'
import axios from 'axios'
import { isBlockedIp, isPrivateAddress, assertPublicUrl, fetchPublicText, publicAxiosOptions, resolvesToPrivate } from '../util/publicUrl'

const run = async () => {
    for (const ip of [
        '127.0.0.1',
        '10.1.2.3',
        '172.20.0.5',
        '192.168.1.1',
        '169.254.169.254',
        '100.64.0.1',
        '0.0.0.0',
        '::1',
        'fd00::1',
        'fe80::1',
        '::ffff:127.0.0.1'
    ]) {
        assert.equal(isBlockedIp(ip), true, `${ip} should be blocked`)
    }
    for (const ip of ['23.227.38.65', '8.8.8.8', '2606:4700::6810:85e5']) {
        assert.equal(isBlockedIp(ip), false, `${ip} should be allowed`)
    }

    for (const url of [
        'http://127.0.0.1:8080/api/v1/health',
        'http://[::1]/',
        'http://169.254.169.254/latest/meta-data',
        'http://localhost:8080/',
        'ftp://example.com/',
        'file:///etc/passwd'
    ]) {
        await assert.rejects(assertPublicUrl(url), `${url} should be refused`)
    }
    await assert.doesNotReject(assertPublicUrl('https://23.227.38.65/'))

    // Size cap and an overall time limit per request (a huge page or a slow drip must not hold a worker)
    let seen: { maxContentLength?: number; maxBodyLength?: number; signal?: unknown } = {}
    const realGet = axios.get
    ;(axios as unknown as { get: unknown }).get = async (_url: string, config: typeof seen) => {
        seen = config
        return { status: 200, data: 'ok', headers: {} }
    }
    assert.equal(await fetchPublicText('https://23.227.38.65/', {}), 'ok')
    ;(axios as unknown as { get: unknown }).get = realGet
    assert.equal(seen.maxContentLength, 3_000_000)
    assert.equal(seen.maxBodyLength, 3_000_000)
    assert.ok(seen.signal, 'an abort signal bounds the whole request')

    // Saving a product link: refused without DNS when it points inside our network
    for (const u of [
        'http://127.0.0.1:8080/api/v1/health',
        'http://localhost/x',
        'http://[::1]/',
        'http://169.254.169.254/',
        'http://api/x',
        'http://db.internal/',
        'ftp://shop.in/a',
        'nonsense'
    ])
        assert.equal(isPrivateAddress(u), true, u)
    for (const u of ['https://shop.alharamainperfumes.com/default/a.html', 'https://hasanoud.com/products/vibe', 'http://8.8.8.8/'])
        assert.equal(isPrivateAddress(u), false, u)
    // axios (audit): a redirect to an internal IP is refused; a public host passes
    assert.throws(() => publicAxiosOptions.beforeRedirect({ hostname: '127.0.0.1' }), /Only public websites/)
    assert.throws(() => publicAxiosOptions.beforeRedirect({ hostname: '[::1]' }), /Only public websites/)
    publicAxiosOptions.beforeRedirect({ hostname: 'example.com' })
    // Saving a website: a name that resolves inside our network is refused; one that does not resolve yet is allowed
    assert.equal(await resolvesToPrivate('https://localtest.me'), true)
    assert.equal(await resolvesToPrivate('localtest.me'), true)
    assert.equal(await resolvesToPrivate('https://qa-broken-site-signalai.com'), false)
    assert.equal(await resolvesToPrivate('https://example.com'), false)
    console.log('public-url checks: PASS')
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
