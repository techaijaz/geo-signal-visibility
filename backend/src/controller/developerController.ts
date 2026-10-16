import { Request, Response, NextFunction } from 'express'
import { IAuthenticatedRequest } from '../middleware/authentication'
import databseService from '../service/databseService'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import responceseMessage from '../constent/responceseMessage'
import { validateJoiSchema, validationSendToDeveloperBody } from '../service/validationService'
import { sendToDeveloper, type DeveloperTaskRef } from '../service/developerTask'

export default {
    send: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as IAuthenticatedRequest
            const { error, value } = validateJoiSchema<{ task: DeveloperTaskRef; developerEmail?: string }>(validationSendToDeveloperBody, req.body)
            if (error) return httpError(next, new Error(error), req, 422)
            const org = await databseService.findOrgByOwnerId(authenticatedUser._id.toString())
            if (!org) return httpError(next, new Error(responceseMessage.NOT_FOUND('Workspace')), req, 404)
            const brand = await databseService.findBrandByIdAndOrgId(req.params.id, org._id.toString())
            if (!brand) return httpError(next, new Error(responceseMessage.NOT_FOUND('Brand')), req, 404)
            const result = await sendToDeveloper(brand, authenticatedUser, value.task, value.developerEmail)
            httpResponse(req, res, 200, responceseMessage.SUCCESS, result)
        } catch (err) {
            const status = (err as { status?: number }).status
            httpError(next, err, req, status ?? 500)
        }
    }
}
