import { Request, Response, NextFunction } from 'express'
import mongoose from 'mongoose'
import { IAuthenticatedRequest } from '../middleware/authentication'
import databseService from '../service/databseService'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import responceseMessage from '../constent/responceseMessage'
import { EUserRole } from '../constent/userConstent'
import config from '../config/config'
import { PLAN_LIMITS, type PlanName } from '../config/planLimits'
import generatedFixModel from '../model/generatedFixModel'
import { createFix } from '../service/fix/createFix'
import { runFix } from '../service/fix/runFix'
import { countFixUsage, nextResetLabel } from '../service/fix/usage'
import { kindsOf } from '../service/fix/pickPages'
import { fixOutputs } from '../service/fix/output'
import { enqueueFixJob } from '../service/queueService'
import type { IGeneratedFix, IFixItem } from '../types/fixTypes'
import type { IBrandProduct } from '../types/brandTypes'

const TYPES = ['faq', 'comparison']
const LANGUAGES = ['en', 'hi-en', 'hi']

// The brand (in the user's own workspace) and its plan, or an error response
const loadBrand = async (req: Request, next: NextFunction) => {
    const { authenticatedUser } = req as IAuthenticatedRequest
    const org = await databseService.findOrgByOwnerId(authenticatedUser._id.toString())
    if (!org) {
        httpError(next, new Error(responceseMessage.NOT_FOUND('Workspace')), req, 404)
        return null
    }
    const brand = await databseService.findBrandByIdAndOrgId(req.params.id, org._id.toString())
    if (!brand) {
        httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
        return null
    }
    const plan = authenticatedUser.role === EUserRole.ADMIN ? 'agency' : ((org.plan || 'free') as PlanName)
    return { org, brand, plan, userId: authenticatedUser._id.toString() }
}

const view = (fix: IGeneratedFix) => ({ ...fix, outputs: fix.status === 'done' ? fixOutputs(fix) : null })

const loadFix = (req: Request, brandId: string) =>
    mongoose.isValidObjectId(req.params.fixId) ? generatedFixModel.findOne({ _id: req.params.fixId, brandId }).lean() : null

// Without Redis (development only) the job runs inside the API process
const enqueue = async (fixId: string) => {
    if (await enqueueFixJob(fixId)) return true
    if (!config.ALLOW_INLINE_JOBS) return null
    void runFix(fixId)
    return true
}

const cleanItem = (i: Record<string, unknown>): IFixItem => ({
    ...(typeof i.question === 'string' ? { question: i.question.slice(0, 500) } : {}),
    ...(typeof i.answer === 'string' ? { answer: i.answer.slice(0, 3000) } : {}),
    ...(typeof i.heading === 'string' ? { heading: i.heading.slice(0, 200) } : {}),
    ...(typeof i.body === 'string' ? { body: i.body.slice(0, 5000) } : {}),
    ...(Array.isArray(i.rows)
        ? {
              rows: (i.rows as Array<Record<string, unknown>>).slice(0, 20).map((r) => ({
                  label: String(r.label ?? '').slice(0, 200),
                  brand: String(r.brand ?? '').slice(0, 500),
                  competitor: String(r.competitor ?? '').slice(0, 500)
              }))
          }
        : {}),
    ...(typeof i.source === 'string' ? { source: i.source.slice(0, 500) } : {})
})

export default {
    list: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const found = await loadBrand(req, next)
            if (!found) return
            const { org, brand, plan } = found
            const fixes = await generatedFixModel
                .find({ brandId: brand._id, status: { $ne: 'failed' } })
                .sort({ createdAt: -1 })
                .limit(50)
                .lean()
            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                fixes: fixes.map((f) => view(f as IGeneratedFix)),
                usage: {
                    used: await countFixUsage(String(org._id)),
                    limit: PLAN_LIMITS[plan].maxFixGenerations,
                    resetsOn: nextResetLabel(new Date())
                },
                kinds: kindsOf((brand.products || []) as IBrandProduct[]),
                competitors: (brand.competitors || []).map((c: { name: string }) => c.name)
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    create: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const found = await loadBrand(req, next)
            if (!found) return
            const { type, kind, competitor, language = 'en' } = (req.body || {}) as Record<string, unknown>
            if (
                !TYPES.includes(type as string) ||
                !LANGUAGES.includes(language as string) ||
                (type === 'comparison' && (typeof competitor !== 'string' || !competitor.trim()))
            ) {
                return httpError(next, new Error('Choose a FAQ or a comparison, and a language'), req, 422)
            }
            const result = await createFix(
                {
                    orgId: String(found.org._id),
                    brandId: String(found.brand._id),
                    userId: found.userId,
                    plan: found.plan,
                    type: type as IGeneratedFix['type'],
                    kind: typeof kind === 'string' ? kind.slice(0, 50) : null,
                    competitor: typeof competitor === 'string' ? competitor.slice(0, 100) : null,
                    language: language as IGeneratedFix['language']
                },
                enqueue
            )
            if (!result.ok) return httpError(next, new Error(result.message), req, result.status)
            httpResponse(req, res, 201, responceseMessage.SUCCESS, { fixId: result.fixId })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    get: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const found = await loadBrand(req, next)
            if (!found) return
            const fix = await loadFix(req, String(found.brand._id))
            if (!fix) return httpError(next, new Error(responceseMessage.NOT_FOUND('Fix')), req, 404)
            httpResponse(req, res, 200, responceseMessage.SUCCESS, view(fix as IGeneratedFix))
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    // The owner's edits (filling [confirm] marks, rewording); never counts against the limit
    update: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const found = await loadBrand(req, next)
            if (!found) return
            const fix = await loadFix(req, String(found.brand._id))
            if (!fix || fix.status !== 'done') return httpError(next, new Error(responceseMessage.NOT_FOUND('Fix')), req, 404)
            const items = Array.isArray(req.body?.items) ? (req.body.items as Array<Record<string, unknown>>).slice(0, 30) : null
            if (!items) return httpError(next, new Error('Nothing to save'), req, 422)
            const title = typeof req.body?.title === 'string' ? req.body.title.slice(0, 200) : fix.title
            const saved = await generatedFixModel.findByIdAndUpdate(fix._id, { items: items.map(cleanItem), title }, { new: true }).lean()
            httpResponse(req, res, 200, responceseMessage.SUCCESS, view(saved as IGeneratedFix))
        } catch (error) {
            httpError(next, error, req, 500)
        }
    }
}
