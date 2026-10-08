import { Request, Response, NextFunction } from 'express'
import config from '../config/config'
import { IAuthenticatedRequest } from '../middleware/authentication'
import databseService from '../service/databseService'
import { enqueueRecommendationJob } from '../service/queueService'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import logger from '../util/loger'
import responceseMessage from '../constent/responceseMessage'
import { EUserRole } from '../constent/userConstent'
import { DAILY_RESCAN_LIMITS, rescanLimitMessage, type PlanName } from '../config/planLimits'
import { recordDone, recordUndone } from '../service/fixEventService'
import { getFixImpact, pickOverviewGroup } from '../service/fixImpactService'

export default {
    getBrandRecommendations: async (req: Request, res: Response, next: NextFunction) => {
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

            const recommendations = await databseService.findRecommendationsByBrandId(brandId)

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                brandId,
                brandName: brand.name,
                recommendations
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    toggleRecommendation: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id: brandId, recId } = req.params
            const { isCompleted } = req.body

            const org = await databseService.findOrgByOwnerId(authenticatedUser._id.toString())
            if (!org) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Workspace')), req, 404)
            }

            const brand = await databseService.findBrandByIdAndOrgId(brandId, org._id.toString())
            if (!brand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }

            const updatedRec = await databseService.toggleRecommendationCompleted(recId, brandId, Boolean(isCompleted))
            if (!updatedRec) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Recommendation')), req, 404)
            }
            // Both are idempotent: a repeated tick or untick changes nothing
            if (updatedRec.isCompleted) await recordDone(updatedRec, 'user')
            else await recordUndone(brandId, recId)

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                recommendation: updatedRec
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    // Visibility before and after the work the brand did (feature #14)
    getFixImpact: async (req: Request, res: Response, next: NextFunction) => {
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
            const now = new Date()
            const groups = await getFixImpact(brandId, plan, now)
            const measuring = groups.filter((g) => g.state === 'measuring')
            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                groups,
                overview: pickOverviewGroup(groups, now),
                // For the Overview card when nothing is ready yet: fixes being measured and the soonest result
                measuringCount: measuring.reduce((n, g) => n + g.fixes.length, 0),
                measuringDays: measuring.some((g) => g.daysLeft) ? Math.min(...measuring.filter((g) => g.daysLeft).map((g) => g.daysLeft!)) : null
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    rescanBrandRecommendations: async (req: Request, res: Response, next: NextFunction) => {
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
            const perDay = (DAILY_RESCAN_LIMITS[plan] ?? DAILY_RESCAN_LIMITS.free).recommendation
            if (!(await databseService.consumeDailyRescan(brandId, 'recommendation', perDay))) {
                return httpError(next, new Error(rescanLimitMessage('recommendation', plan, perDay)), req, 429)
            }

            const job = await enqueueRecommendationJob(brandId)

            if (job) {
                const currentRecs = await databseService.findRecommendationsByBrandId(brandId)
                return httpResponse(req, res, 202, 'Recommendation generation enqueued successfully', {
                    brandId,
                    brandName: brand.name,
                    status: 'queued',
                    jobId: job.id,
                    recommendations: currentRecs
                })
            }

            if (!config.ALLOW_INLINE_JOBS) {
                await databseService.refundDailyRescan(brandId, 'recommendation')
                return httpError(next, new Error(responceseMessage.QUEUE_UNAVAILABLE), req, 503)
            }

            // Development only: run inline when Redis / BullMQ is unavailable
            logger.warn(`[Recommendation Controller] Queue unavailable, falling back to inline generation for brand ${brandId}`)
            const freshRecommendations = await databseService.rescanBrandRecommendations(brandId)

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                brandId,
                brandName: brand.name,
                status: 'completed',
                recommendations: freshRecommendations
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    }
}
