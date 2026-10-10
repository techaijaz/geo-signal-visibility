import config from '../../config/config'
import { EApplicationEnvionment } from '../../constent/application'

// Cloudflare Turnstile token check (single use). No secret: allowed outside production, refused in it
export const verifyTurnstile = async (token: string | undefined, ip: string, fetcher: typeof fetch = fetch): Promise<boolean> => {
    const secret = process.env.TURNSTILE_SECRET_KEY
    if (!secret) return config.ENV !== EApplicationEnvionment.PRODUCTION
    if (!token) return false
    try {
        const res = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body: new URLSearchParams({ secret, response: token, remoteip: ip }),
            signal: AbortSignal.timeout(5000)
        })
        return ((await res.json()) as { success?: boolean }).success === true
    } catch {
        return false
    }
}
