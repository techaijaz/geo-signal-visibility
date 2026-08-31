import { Request, Response, NextFunction } from 'express'
import { IDecriptedJwt, IUserWithId } from '../types/userTypes'
import quiker from '../util/quiker'
import config from '../config/config'
import databseService from '../service/databseService'
import httpError from '../util/httpError'
import responceseMessage from '../constent/responceseMessage'

export interface IAuthenticatedRequest extends Request {
    authenticatedUser: IUserWithId
}

export default async (request: Request, _res: Response, next: NextFunction) => {
    try {
        const req = request as IAuthenticatedRequest
        const { cookies, headers } = req
        const cookieToken = (cookies as { accessToken?: string })?.accessToken
        const authHeader = headers.authorization
        const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined
        const accessToken = cookieToken || bearerToken

        if (!accessToken) {
            return httpError(next, new Error(responceseMessage.UNAUTHORIZED), req, 401)
        }

        try {
            const { userId } = quiker.verifyToken(accessToken, config.ACCESS_TOKEN.SECRET as string) as IDecriptedJwt

            const user = await databseService.findUserById(userId)
            if (user) {
                req.authenticatedUser = user as unknown as IUserWithId
                return next()
            }
            return httpError(next, new Error(responceseMessage.UNAUTHORIZED), req, 401)
        } catch {
            return httpError(next, new Error(responceseMessage.UNAUTHORIZED), req, 401)
        }
    } catch (error) {
        httpError(next, error, request, 500)
    }
}

