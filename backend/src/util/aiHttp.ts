import config from '../config/config'
import logger from './loger'

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])
const MAX_BACKOFF_MS = 20000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Per-provider in-flight cap (per process) so a burst of scans can't flood one provider
const inFlight = new Map<string, number>()
const waiters = new Map<string, Array<() => void>>()

const acquire = async (provider: string) => {
    const limit = config.AI_LIMITS.PROVIDER_CONCURRENCY
    while ((inFlight.get(provider) || 0) >= limit) {
        await new Promise<void>((resolve) => {
            const queue = waiters.get(provider) || []
            queue.push(resolve)
            waiters.set(provider, queue)
        })
    }
    inFlight.set(provider, (inFlight.get(provider) || 0) + 1)
}

const release = (provider: string) => {
    inFlight.set(provider, Math.max(0, (inFlight.get(provider) || 1) - 1))
    waiters.get(provider)?.shift()?.()
}

const backoffMs = (attempt: number, retryAfter: string | null) => {
    const retryAfterSec = retryAfter ? Number(retryAfter) : NaN
    if (!Number.isNaN(retryAfterSec) && retryAfterSec > 0) return Math.min(retryAfterSec * 1000, MAX_BACKOFF_MS)
    return Math.min(1000 * 2 ** attempt + Math.random() * 500, MAX_BACKOFF_MS)
}

/**
 * fetch for AI provider calls: per-request timeout, retries on 429/5xx/network errors
 * (honouring Retry-After), and a per-provider concurrency cap.
 * Returns the final Response (possibly non-ok); throws only if every attempt failed at the network level.
 */
export const aiFetch = async (provider: string, url: string, init: RequestInit): Promise<Response> => {
    const { TIMEOUT_MS, RETRIES } = config.AI_LIMITS
    await acquire(provider)
    try {
        let lastError: unknown = null
        for (let attempt = 0; attempt <= RETRIES; attempt++) {
            try {
                const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
                if (!RETRYABLE_STATUS.has(response.status) || attempt === RETRIES) return response
                logger.warn(`[aiFetch] ${provider} returned ${response.status}, retry ${attempt + 1}/${RETRIES}`)
                await sleep(backoffMs(attempt, response.headers.get('retry-after')))
            } catch (error) {
                lastError = error
                if (attempt === RETRIES) break
                logger.warn(`[aiFetch] ${provider} network error/timeout, retry ${attempt + 1}/${RETRIES}`)
                await sleep(backoffMs(attempt, null))
            }
        }
        throw lastError
    } finally {
        release(provider)
    }
}
