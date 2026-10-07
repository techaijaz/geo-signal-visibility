/* eslint-disable no-console */
// Run: NODE_ENV=development DATABASE_URL=mongodb://127.0.0.1:1/none npx ts-node --transpile-only src/checks/objectIdParam.check.ts
import assert from 'assert'
import objectIdParam from '../middleware/objectIdParam'

const run = (id: string) => {
    let passed = false
    let error: { statusCode?: number } | undefined
    objectIdParam(
        { method: 'GET', originalUrl: '/x', ip: '' } as never,
        {} as never,
        ((err?: { statusCode?: number }) => {
            if (err) error = err
            else passed = true
        }) as never,
        id
    )
    return { passed, status: error?.statusCode }
}

assert.deepStrictEqual(run('6ac39995615f0313821e17b9'), { passed: true, status: undefined })
assert.deepStrictEqual(run('undefined'), { passed: false, status: 400 })
assert.deepStrictEqual(run('123456789012'), { passed: false, status: 400 }) // 12 chars passes isValidObjectId alone
console.log('object id param checks: PASS')
process.exit(0)
