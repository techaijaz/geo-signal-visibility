import { NextFunction, Request, Response } from 'express'
import { THttpError } from '../types/types'
import responceseMessage from '../constent/responceseMessage'
import httpError from '../util/httpError'

export const notFoundError = (req: Request, _: Response, next: NextFunction) => {
    try {
        throw new Error(responceseMessage.NOT_FOUND('Route'))
    } catch (error) {
        httpError(next, error, req, 404)
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default (error: THttpError, _: Request, res: Response, __: NextFunction) => {
    res.status(error.statusCode).json(error)
}
