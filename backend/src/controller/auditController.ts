import { Request, Response, NextFunction } from 'express'
import { IAuthenticatedRequest } from '../middleware/authentication'
import databseService from '../service/databseService'
import { enqueueAuditJob } from '../service/queueService'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import logger from '../util/loger'
import responceseMessage from '../constent/responceseMessage'

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

            // Fallback to inline scan if Queue / Redis is unavailable
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
