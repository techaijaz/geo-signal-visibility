import { NextFunction, Request, Response } from 'express'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import emailService from '../service/emailService'
import { fetchPublicText } from '../util/publicUrl'
import categoryModel from '../model/categoryModel'
import freeCheckModel from '../model/freeCheckModel'
import leadModel from '../model/leadModel'
import { getSetting } from '../model/appSettingModel'
import { freeCheckQuestions } from '../service/querySuggestionService'
import { enqueueFreeCheckJob } from '../service/queueService'
import { verifyTurnstile } from '../service/freeCheck/turnstile'
import { otpEmail, reportEmail, verifyLeadUnsubscribe } from '../service/freeCheck/emails'
import { KEYS, consume, redisStore, refund, type IFreeCheckStore } from '../service/freeCheck/store'
import {
    countryFromTz,
    fullResult,
    halfResult,
    hashIp,
    hashOtp,
    isDisposableEmail,
    istDay,
    newCheckId,
    newOtp,
    nextMorningIst,
    normaliseEmail,
    normaliseSiteUrl,
    siteFacts
} from '../service/freeCheck/helpers'
import {
    validateJoiSchema,
    validationFreeCheckCreate,
    validationFreeCheckEmail,
    validationFreeCheckSite,
    validationFreeCheckVerify
} from '../service/validationService'
import logger from '../util/loger'

const LIMITS = { ipChecks: 3, ipSites: 10, ipCodes: 5, emailCodes: 3, emailChecks: 2 }
const CACHE_TTL = 24 * 60 * 60
const fail = (next: NextFunction, req: Request, status: number, message: string) => httpError(next, new Error(message), req, status)

// Replaceable in checks: no Redis, Cloudflare, mail or queue needed there
const deps = {
    store: null as IFreeCheckStore | null,
    turnstile: verifyTurnstile as (token: string | undefined, ip: string) => Promise<boolean>,
    send: (to: string[], subject: string, text: string, html?: string): Promise<unknown> => emailService.sendEmail(to, subject, text, { html }),
    fetchHtml: (url: string) => fetchPublicText(url, { 'User-Agent': 'Mozilla/5.0 (compatible; SignalBot/1.0)' }, 8000),
    enqueue: enqueueFreeCheckJob as (checkId: string, runAt?: Date) => Promise<unknown>,
    categories: async () => (await categoryModel.find({ isActive: true }).select('name').lean()).map((c) => c.name),
    now: () => new Date()
}
const store = () => (deps.store ??= redisStore())
const ipOf = (req: Request) => hashIp(req.ip || '')

// Once a day at 80% of the budget, if an alert address is set
const alertIfBusy = async (used: number, limit: number) => {
    const to = process.env.FREE_CHECK_ALERT_EMAIL
    if (!to || used < Math.ceil(limit * 0.8)) return
    if (!(await store().setOnce(KEYS.alert + istDay(deps.now()), 26 * 60 * 60))) return
    await deps.send([to], `Free checker: ${used} of ${limit} checks used today`, 'Raise the limit on Admin → Free checker if this is real traffic.')
}

export default {
    deps,

    // Homepage → brand name, category and its questions (no AI call)
    site: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { error, value } = validateJoiSchema<{ url: string; category?: string }>(validationFreeCheckSite, req.body)
            const site = !error && normaliseSiteUrl(value.url)
            if (!site) return fail(next, req, 400, 'Enter your full website address, like https://yourstore.com')
            if (!(await consume(store(), KEYS.ipSites(ipOf(req)), LIMITS.ipSites, istDay(deps.now())))) {
                return fail(next, req, 429, "Today's free lookups are used up. Try again tomorrow.")
            }
            const categories = await deps.categories()
            const chosen = value.category && categories.includes(value.category) ? value.category : ''
            const facts = chosen
                ? { brandName: '', category: chosen }
                : siteFacts(await deps.fetchHtml(site.url).catch(() => ''), categories, site.domain)
            httpResponse(req, res, 200, 'OK', { ...site, ...facts, categories, questions: facts.category ? freeCheckQuestions(facts.category) : [] })
        } catch (err) {
            httpError(next, err, req, 500)
        }
    },

    create: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { error, value } = validateJoiSchema<{
                url: string
                brandName: string
                category: string
                questions: string[]
                turnstileToken?: string
                tz?: string
            }>(validationFreeCheckCreate, req.body)
            const site = !error && normaliseSiteUrl(value.url)
            if (!site) return fail(next, req, 400, 'Check the website, the brand name, and pick exactly 3 questions.')
            const allowed = new Set(freeCheckQuestions(value.category).map((q) => q.text))
            if (!(await deps.categories()).includes(value.category) || !value.questions.every((q) => allowed.has(q))) {
                return fail(next, req, 400, 'Pick 3 questions from the list.')
            }
            if (!(await deps.turnstile(value.turnstileToken, req.ip || '')))
                return fail(next, req, 403, 'Verification failed. Refresh the page and try again.')

            // Same visitor, same site: the earlier result, whatever questions they pick now
            const ip = ipOf(req)
            const cached = await store().get(KEYS.cache(ip, site.domain))
            const earlier = cached ? await freeCheckModel.findOne({ checkId: cached }).select('status').lean() : null
            // A failed check is never served again: the visitor may retry
            if (earlier && earlier.status !== 'failed') return httpResponse(req, res, 200, 'OK', { checkId: cached, status: earlier.status })

            const day = istDay(deps.now())
            if (!(await consume(store(), KEYS.ipChecks(ip), LIMITS.ipChecks, day))) {
                return fail(next, req, 429, "Today's 3 free checks are used. Sign up, or come back tomorrow.")
            }
            const limit = await getSetting('freeCheckDailyLimit', 150)
            const withinBudget = await consume(store(), KEYS.global, limit, day)
            const checkId = newCheckId()
            const status = withinBudget ? 'queued' : 'waiting-email'
            await freeCheckModel.create({
                checkId,
                url: site.url,
                domain: site.domain,
                brandName: value.brandName,
                category: value.category,
                market: 'IN',
                questions: value.questions.map((text) => ({ text, answers: [] })),
                ipHash: ip,
                country: countryFromTz(value.tz || ''),
                status,
                budgetDay: withinBudget ? day : null
            })
            await store().set(KEYS.cache(ip, site.domain), checkId, CACHE_TTL)
            if (withinBudget) {
                // Queue down: no stuck check, the visitor's place and budget given back
                if (!(await deps.enqueue(checkId))) {
                    await freeCheckModel.updateOne({ checkId }, { $set: { status: 'failed' } })
                    await refund(store(), KEYS.global, day)
                    await refund(store(), KEYS.ipChecks(ip), day)
                    await store().del(KEYS.cache(ip, site.domain))
                    return fail(next, req, 503, 'Abhi check shuru nahi ho paya. 5 minute baad dobara karo.')
                }
                const used = Number((await store().get(KEYS.global + day)) || 0)
                alertIfBusy(used, limit).catch((e) => logger.warn('[freeCheck] alert failed', { meta: e }))
            }
            httpResponse(req, res, 201, 'OK', { checkId, status })
        } catch (err) {
            httpError(next, err, req, 500)
        }
    },

    // Counts only; a verified check also gives the signup page its email, site and category
    status: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const check = await freeCheckModel.findOne({ checkId: String(req.params.checkId) }).lean()
            if (!check) return fail(next, req, 404, 'Check not found')
            const verified = check.verifiedAt ? { verified: true, email: check.email, url: check.url, category: check.category } : { verified: false }
            httpResponse(req, res, 200, 'OK', { ...halfResult(check), ...verified })
        } catch (err) {
            httpError(next, err, req, 500)
        }
    },

    sendCode: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { error, value } = validateJoiSchema<{ email: string; marketingConsent: boolean }>(validationFreeCheckEmail, req.body)
            const email = !error && normaliseEmail(value.email)
            if (!email) return fail(next, req, 400, 'Enter a valid email address.')
            if (isDisposableEmail(email)) return fail(next, req, 400, 'Please use your work or personal email, not a temporary one.')
            const check = await freeCheckModel.findOne({ checkId: String(req.params.checkId) })
            if (!check) return fail(next, req, 404, 'Check not found')
            const day = istDay(deps.now())
            const allowed =
                (await consume(store(), KEYS.ipCodes(ipOf(req)), LIMITS.ipCodes, day)) &&
                (await consume(store(), KEYS.emailCodes(email), LIMITS.emailCodes, day))
            if (!allowed) return fail(next, req, 429, 'Too many codes today. Try again tomorrow.')
            const code = newOtp()
            await freeCheckModel.updateOne(
                { checkId: check.checkId },
                {
                    $set: {
                        email,
                        otpHash: hashOtp(code, check.checkId),
                        otpExpiresAt: new Date(deps.now().getTime() + 10 * 60 * 1000),
                        otpAttempts: 0,
                        consentRequested: value.marketingConsent
                    }
                }
            )
            const mail = otpEmail(code)
            await deps.send([email], mail.subject, mail.text, mail.html)
            httpResponse(req, res, 200, 'OK', { sent: true })
        } catch (err) {
            httpError(next, err, req, 500)
        }
    },

    // The right code: lead saved, names shown, report emailed (now, or after the next-morning run)
    verify: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { error, value } = validateJoiSchema<{ code: string }>(validationFreeCheckVerify, req.body)
            const checkId = String(req.params.checkId)
            if (!(await freeCheckModel.exists({ checkId, email: { $ne: null } }))) return fail(next, req, 404, 'Check not found')
            // Each try is counted before the code is compared, so parallel requests can't get extra tries
            const check = await freeCheckModel.findOneAndUpdate({ checkId, otpAttempts: { $lt: 5 } }, { $inc: { otpAttempts: 1 } }, { new: true })
            if (!check || !check.email) return fail(next, req, 429, 'Too many tries. Ask for a new code.')
            const now = deps.now()
            const valid =
                !error && check.otpHash && check.otpExpiresAt && check.otpExpiresAt > now && check.otpHash === hashOtp(value.code, check.checkId)
            if (!valid) return fail(next, req, 400, 'Wrong or expired code. Ask for a new one.')
            // One email unlocks at most 2 checks a day, whichever way they ran
            if (!(await consume(store(), KEYS.emailChecks(check.email), LIMITS.emailChecks, istDay(now)))) {
                return fail(next, req, 429, 'This email has used its free checks today.')
            }
            const consent = Boolean(check.consentRequested)
            const scheduled = check.status === 'waiting-email'
            if (scheduled && !(await deps.enqueue(check.checkId, nextMorningIst(now)))) {
                await refund(store(), KEYS.emailChecks(check.email), istDay(now))
                return fail(next, req, 503, 'Abhi check line me nahi lag paya. Thodi der baad code dobara daalo.')
            }
            await freeCheckModel.updateOne(
                { checkId: check.checkId },
                { $set: { verifiedAt: now, otpHash: null, otpExpiresAt: null, ...(scheduled ? { status: 'scheduled' } : {}) } }
            )
            await leadModel.updateOne(
                { email: check.email },
                {
                    $set: {
                        domain: check.domain,
                        brandName: check.brandName,
                        category: check.category,
                        market: check.market,
                        country: check.country,
                        verifiedAt: now,
                        ...(consent ? { marketingConsent: true, consentAt: now } : {})
                    },
                    $addToSet: { checkIds: check.checkId }
                },
                { upsert: true }
            )
            await store().del(KEYS.cache(check.ipHash, check.domain))
            const fresh = (await freeCheckModel.findOne({ checkId: check.checkId }).lean())!
            if (fresh.status === 'done') {
                const mail = reportEmail(fresh, check.email, consent)
                await deps
                    .send([check.email], mail.subject, mail.text, mail.html)
                    .catch((e) => logger.warn('[freeCheck] report email failed', { meta: e }))
            }
            httpResponse(req, res, 200, 'OK', fresh.status === 'done' ? fullResult(fresh) : halfResult(fresh))
        } catch (err) {
            httpError(next, err, req, 500)
        }
    },

    // Link in the report email: stops tips and updates
    unsubscribe: async (req: Request, res: Response) => {
        const email = String(req.query.e || '').toLowerCase()
        if (email && verifyLeadUnsubscribe(email, String(req.query.t || ''))) {
            await leadModel.updateOne({ email }, { $set: { marketingConsent: false } })
        }
        res.status(200).send('You will not get tips and updates from Signal any more.')
    }
}
