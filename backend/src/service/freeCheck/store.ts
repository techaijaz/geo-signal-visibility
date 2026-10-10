import IORedis from 'ioredis'
import { connection } from '../queueService'

// Daily counters and the ip+domain cache. Redis in the app, an in-memory twin in checks
export interface IFreeCheckStore {
    incr(key: string, ttlSeconds: number): Promise<number>
    decr(key: string): Promise<void>
    get(key: string): Promise<string | null>
    set(key: string, value: string, ttlSeconds: number): Promise<void>
    del(key: string): Promise<void>
    setOnce(key: string, ttlSeconds: number): Promise<boolean> // true only the first time
}

const DAY_TTL = 26 * 60 * 60 // a day key outlives its IST day

// Day-counted keys end with ':' and get the IST day appended
export const KEYS = {
    ipChecks: (ip: string) => `fc:ip:checks:${ip}:`,
    ipSites: (ip: string) => `fc:ip:sites:${ip}:`,
    ipCodes: (ip: string) => `fc:ip:codes:${ip}:`,
    emailCodes: (email: string) => `fc:email:codes:${email}:`,
    emailChecks: (email: string) => `fc:email:checks:${email}:`,
    global: 'fc:global:',
    cache: (ip: string, domain: string) => `fc:cache:${ip}:${domain}`,
    alert: 'fc:alert:'
}

// Counts one; over the limit the count is given back and false returned
export const consume = async (store: IFreeCheckStore, key: string, limit: number, day: string) => {
    const n = await store.incr(key + day, DAY_TTL)
    if (n > limit) {
        await store.decr(key + day)
        return false
    }
    return true
}
export const refund = (store: IFreeCheckStore, key: string, day: string) => store.decr(key + day)

export const memoryStore = (): IFreeCheckStore => {
    const m = new Map<string, string>()
    return {
        incr: async (k) => {
            const n = Number(m.get(k) || 0) + 1
            m.set(k, String(n))
            return n
        },
        decr: async (k) => {
            m.set(k, String(Math.max(0, Number(m.get(k) || 0) - 1)))
        },
        get: async (k) => m.get(k) ?? null,
        set: async (k, v) => {
            m.set(k, v)
        },
        del: async (k) => {
            m.delete(k)
        },
        setOnce: async (k) => {
            if (m.has(k)) return false
            m.set(k, '1')
            return true
        }
    }
}

let client: IORedis | null = null
export const redisStore = (): IFreeCheckStore => {
    client ??= new IORedis({ ...connection, maxRetriesPerRequest: 1, enableOfflineQueue: true })
    const r = client
    return {
        incr: async (k, ttl) => {
            const res = await r.multi().incr(k).expire(k, ttl, 'NX').exec()
            return Number(res?.[0]?.[1] ?? 0)
        },
        decr: async (k) => {
            // Never below zero: a refund after the key expired must not leave -1
            const n = await r.decr(k)
            if (n < 0) await r.set(k, '0', 'KEEPTTL')
        },
        get: (k) => r.get(k),
        set: async (k, v, ttl) => {
            await r.set(k, v, 'EX', ttl)
        },
        del: async (k) => {
            await r.del(k)
        },
        setOnce: async (k, ttl) => (await r.set(k, '1', 'EX', ttl, 'NX')) === 'OK'
    }
}
