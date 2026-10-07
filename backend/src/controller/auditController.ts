import { Request, Response, NextFunction } from 'express'
import config from '../config/config'
import { IAuthenticatedRequest } from '../middleware/authentication'
import databseService from '../service/databseService'
import { enqueueAuditJob } from '../service/queueService'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import logger from '../util/loger'
import responceseMessage from '../constent/responceseMessage'
import { EUserRole } from '../constent/userConstent'
import { DAILY_RESCAN_LIMITS, rescanLimitMessage, type PlanName } from '../config/planLimits'
import auditModel from '../model/auditModel'
import { productCheckGate, rememberProductCheck, runAiView, type IAiView } from '../service/aiViewService'
import { storeAuditForBrand } from '../service/storeAuditService'
import { auditService } from '../service/auditService'

export default {
    getBrandAudit: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id: brandId } = req.params

            const org = await databseService.findOrgByOwnerId(authenticatedUser._id.toString())
            if (!org) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Workspace')), req, 404)
            }

            const brand = await databseService.findBrandByIdAndOrgId(brandId, org._id.toString())
            if (!brand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }

            const audit = await databseService.findAuditByBrandId(brandId)

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                brandId,
                brandName: brand.name,
                website: brand.website,
                audit
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    runAiView: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id: brandId } = req.params
            const org = await databseService.findOrgByOwnerId(authenticatedUser._id.toString())
            if (!org) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Workspace')), req, 404)
            }
            const brand = await databseService.findBrandByIdAndOrgId(brandId, org._id.toString())
            if (!brand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }
            // One product page from the Products page: only on the brand's own site, not cached or saved
            const productUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : ''
            if (productUrl) {
                const host = (u: string) => new URL(u).hostname.replace(/^www\./, '')
                let sameSite = false
                try {
                    sameSite = host(productUrl) === host(auditService.cleanUrl(brand.website))
                } catch {
                    sameSite = false
                }
                if (!sameSite) return httpError(next, new Error('Use a page from your own website'), req, 422)
                const gate = productCheckGate(brandId, productUrl)
                if (gate.action === 'cached') return httpResponse(req, res, 200, responceseMessage.SUCCESS, { aiView: gate.view })
                if (gate.action === 'wait') return httpError(next, new Error('A page check just ran. Try again in 30 seconds.'), req, 429)
                const view = await runAiView(brand.website, productUrl)
                rememberProductCheck(brandId, productUrl, view)
                return httpResponse(req, res, 200, responceseMessage.SUCCESS, { aiView: view })
            }
            // Each run opens Chrome twice: a result under 5 minutes old is returned as is
            const existing = (await auditModel.findOne({ brandId }).select('aiView').lean())?.aiView as IAiView | null | undefined
            // ...but only for the same website: after the brand's website changes, check the new one
            const sameSite = existing?.pages?.some((p) => p.label === 'Homepage' && p.url === auditService.cleanUrl(brand.website))
            if (existing?.checkedAt && sameSite && Date.now() - new Date(existing.checkedAt).getTime() < 5 * 60 * 1000) {
                return httpResponse(req, res, 200, responceseMessage.SUCCESS, { aiView: existing })
            }
            const aiView = await runAiView(brand.website)
            // No upsert: a bare audit document would stop the brand's first real audit from running
            await auditModel.updateOne({ brandId }, { $set: { aiView } })
            httpResponse(req, res, 200, responceseMessage.SUCCESS, { aiView })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },
    // Product and collection pages only, from the audit page; counts against the daily audit re-scans
    runStoreAudit: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id: brandId } = req.params
            const org = await databseService.findOrgByOwnerId(authenticatedUser._id.toString())
            if (!org) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Workspace')), req, 404)
            }
            const brand = await databseService.findBrandByIdAndOrgId(brandId, org._id.toString())
            if (!brand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }
            // The result is saved on the audit; without one it would be lost and the re-scan wasted
            if (!(await auditModel.exists({ brandId }))) {
                return httpError(next, new Error('Run the website audit first, then audit your product pages.'), req, 409)
            }
            const plan = authenticatedUser.role === EUserRole.ADMIN ? 'agency' : ((org.plan || 'free') as PlanName)
            const perDay = (DAILY_RESCAN_LIMITS[plan] ?? DAILY_RESCAN_LIMITS.free).audit
            if (!(await databseService.consumeDailyRescan(brandId, 'audit', perDay))) {
                return httpError(next, new Error(rescanLimitMessage('audit', plan, perDay)), req, 429)
            }
            let storeAudit
            try {
                storeAudit = await storeAuditForBrand(brand)
            } catch (err) {
                // The audit didn't run, so the user gets today's re-scan back
                await databseService.refundDailyRescan(brandId, 'audit')
                throw err
            }
            // No upsert: a bare audit document would stop the brand's first real audit from running
            await auditModel.updateOne({ brandId }, { $set: { storeAudit } })
            httpResponse(req, res, 200, responceseMessage.SUCCESS, { storeAudit })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },
    rescanBrandAudit: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id: brandId } = req.params

            const org = await databseService.findOrgByOwnerId(authenticatedUser._id.toString())
            if (!org) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Workspace')), req, 404)
            }

            const brand = await databseService.findBrandByIdAndOrgId(brandId, org._id.toString())
            if (!brand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }

            const plan = authenticatedUser.role === EUserRole.ADMIN ? 'agency' : ((org.plan || 'free') as PlanName)
            const perDay = (DAILY_RESCAN_LIMITS[plan] ?? DAILY_RESCAN_LIMITS.free).audit
            if (!(await databseService.consumeDailyRescan(brandId, 'audit', perDay))) {
                return httpError(next, new Error(rescanLimitMessage('audit', plan, perDay)), req, 429)
            }

            const job = await enqueueAuditJob(brandId)

            if (job) {
                const currentAudit = await databseService.findAuditByBrandId(brandId)
                return httpResponse(req, res, 202, 'Brand audit enqueued successfully', {
                    brandId,
                    brandName: brand.name,
                    website: brand.website,
                    status: 'queued',
                    jobId: job.id,
                    audit: currentAudit
                })
            }

            if (!config.ALLOW_INLINE_JOBS) {
                await databseService.refundDailyRescan(brandId, 'audit')
                return httpError(next, new Error(responceseMessage.QUEUE_UNAVAILABLE), req, 503)
            }

            // Development only: run inline when Redis / BullMQ is unavailable
            logger.warn(`[Audit Controller] Queue unavailable, falling back to inline audit for brand ${brandId}`)
            const freshAudit = await databseService.rescanBrandAudit(brandId)

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                brandId,
                brandName: brand.name,
                website: brand.website,
                status: 'completed',
                audit: freshAudit
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    }
}
