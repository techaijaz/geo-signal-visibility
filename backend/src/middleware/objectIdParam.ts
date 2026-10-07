import { Request, Response, NextFunction } from 'express'
import mongoose from 'mongoose'
import httpError from '../util/httpError'

// Every ":id" in the API is a database id: a malformed one ("undefined") is a bad request, not a server error
const objectIdParam = (req: Request, _res: Response, next: NextFunction, id: string) => {
    if (mongoose.isValidObjectId(id) && /^[0-9a-f]{24}$/i.test(id)) return next()
    return httpError(next, new Error('Invalid id'), req, 400)
}

export default objectIdParam
