import { vi } from 'vitest'

// Stand-in for a mongoose Query: chainable (.select/.sort/.lean) and awaitable
export const query = <T>(value: T) => {
    const q = {
        select: vi.fn(() => q),
        sort: vi.fn(() => q),
        lean: vi.fn(() => q),
        then: (resolve: (v: T) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(value).then(resolve, reject)
    }
    return q
}
