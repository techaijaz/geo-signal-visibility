import { Request, Response, NextFunction } from 'express'
import { IAuthenticatedRequest } from '../middleware/authentication'
import databseService from '../service/databseService'
import { enqueueScanJob } from '../service/queueService'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import responceseMessage from '../constent/responceseMessage'

export default {
    getBrandMentions: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id: brandId } = req.params
            const { model } = req.query as { model?: string }

            const orgId = await databseService.findOrgByOwnerId(authenticatedUser._id.toString())
            if (!orgId) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Workspace')), req, 404)
            }

            const brand = await databseService.findBrandByIdAndOrgId(brandId, orgId._id.toString())
            if (!brand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }

            const mentions = await databseService.findMentionsByBrandId(brandId, model)

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                brandId,
                brandName: brand.name,
                mentions
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },

    rescanMentions: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { id: brandId } = req.params

            const orgId = await databseService.findOrgByOwnerId(authenticatedUser._id.toString())
            if (!orgId) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Workspace')), req, 404)
            }

            const brand = await databseService.findBrandByIdAndOrgId(brandId, orgId._id.toString())
            if (!brand) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            }

            const job = await enqueueScanJob(brandId)

            if (job) {
                const currentMentions = await databseService.findMentionsByBrandId(brandId)
                return httpResponse(req, res, 202, 'AI scan enqueued successfully', {
                    brandId,
                    brandName: brand.name,
                    status: 'queued',
                    jobId: job.id,
                    mentions: currentMentions
                })
            }

            // Fallback to inline scan if Redis / BullMQ is unavailable
            console.warn(`[Mention Controller] Queue unavailable, falling back to inline scan for brand ${brandId}`)
            const freshMentions = await databseService.rescanBrandMentions(brandId)

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                brandId,
                brandName: brand.name,
                status: 'completed',
                mentions: freshMentions
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    }
}
