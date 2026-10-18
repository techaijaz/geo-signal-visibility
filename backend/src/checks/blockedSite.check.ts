/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/blockedSite.check.ts
import assert from 'assert'
import { fetchFail } from '../service/auditService'

// A site that refuses our checker is blocked, not down: say so and say what to do
for (const status of [401, 403, 429]) {
    const f = fetchFail(status, 'clovedental.in', `Request failed with status code ${status}`)
    assert.equal(
        f.issue,
        `clovedental.in blocked our checker (HTTP ${status}), so we couldn't read your pages. Firewalls like Cloudflare often block AI crawlers the same way. Ask your developer or host to allow GPTBot, ClaudeBot and PerplexityBot.`
    )
    assert.equal(f.indexStatus, `Blocked our checker (HTTP ${status})`)
    assert.equal(f.badge, 'badge-warn')
}
// Timeouts, DNS errors and server errors: the site really can't be opened
for (const [status, msg] of [
    [undefined, 'timeout of 8000ms exceeded'],
    [undefined, 'getaddrinfo ENOTFOUND nope.example'],
    [500, 'Request failed with status code 500']
] as Array<[number | undefined, string]>) {
    const f = fetchFail(status, 'nope.example', msg)
    assert.equal(f.issue, `Unable to fetch website content directly from nope.example (${msg})`)
    assert.equal(f.indexStatus, 'Unreachable Domain')
    assert.equal(f.badge, 'badge-bad')
}

console.log('blockedSite checks: PASS')
process.exit(0)
