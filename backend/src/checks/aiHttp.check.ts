/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/aiHttp.check.ts
import assert from 'assert'
import http from 'http'
import { aiFetch } from '../util/aiHttp'
;(async () => {
    // A server that answers after 300 ms, counting requests
    let hits = 0
    const server = http.createServer((_req, res) => {
        hits++
        setTimeout(() => res.end('ok'), 300)
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`

    try {
        // A per-call timeout longer than the answer → ok on the first try
        const res = await aiFetch('TEST', url, { method: 'GET' }, { timeoutMs: 2000, retries: 0 })
        assert.equal(await res.text(), 'ok')
        assert.equal(hits, 1)

        // A per-call timeout shorter than the answer with no retries → one request only (a slow paid call is never sent twice)
        hits = 0
        await assert.rejects(aiFetch('TEST', url, { method: 'GET' }, { timeoutMs: 100, retries: 0 }))
        assert.equal(hits, 1)

        console.log('aiHttp checks passed')
    } finally {
        server.close()
    }
    process.exit(0)
})().catch((err) => {
    console.error(err)
    process.exit(1)
})
