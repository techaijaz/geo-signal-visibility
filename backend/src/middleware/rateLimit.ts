import { NextFunction, Request, Response } from 'express'
import { EApplicationEnvionment } from '../constent/application'
import config from '../config/config'
import { rateLimiterMongo } from '../config/rateLimiter'
import httpError from '../util/httpError'
import responceseMessage from '../constent/responceseMessage'

export default (req: Request, _: Response, next: NextFunction) => {
    if (config.ENV === EApplicationEnvionment.DEVELOPMENT) {
        return next()
    }
    if (rateLimiterMongo) {
        rateLimiterMongo
            .consume(req.ip as string, 1)
            .then(() => {
                next()
            })
            .catch(() => {
                httpError(next, new Error(responceseMessage.TOO_MANY_REQUEST), req, 429)
            })
    }
}
