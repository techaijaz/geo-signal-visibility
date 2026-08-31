import { Request, Response, NextFunction } from 'express'
import { IAuthenticatedRequest } from '../middleware/authentication'
import databseService from '../service/databseService'
import { enqueueRecommendationJob } from '../service/queueService'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import responceseMessage from '../constent/responceseMessage'

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

            const updatedRec = await databseService.toggleRecommendationCompleted(recId, Boolean(isCompleted))
            if (!updatedRec) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('Recommendation')), req, 404)
            }

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                recommendation: updatedRec
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

            // Fallback to inline scan if Queue / Redis is unavailable
            console.warn(`[Recommendation Controller] Queue unavailable, falling back to inline generation for brand ${brandId}`)
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
