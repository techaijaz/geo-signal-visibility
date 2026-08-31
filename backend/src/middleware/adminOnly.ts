import { Request, Response, NextFunction } from 'express'
import { IAuthenticatedRequest } from './authentication'
import { EUserRole } from '../constent/userConstent'
import httpError from '../util/httpError'

export default (request: Request, _res: Response, next: NextFunction) => {
    try {
        const req = request as IAuthenticatedRequest
        if (!req.authenticatedUser || req.authenticatedUser.role !== EUserRole.ADMIN) {
            return httpError(next, new Error('Access denied: Admin privileges required'), req, 403)
        }
        return next()
    } catch (error) {
        httpError(next, error, request, 500)
    }
}
