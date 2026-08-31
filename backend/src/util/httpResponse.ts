import { Request, Response } from 'express'
import { ThhtpResponse } from '../types/types'
import config from '../config/config'
import { EApplicationEnvionment } from '../constent/application'
import logger from '../util/loger'

export default (req: Request, res: Response, responseStatusCode: number, responseMessage: string, data: unknown = null) => {
    const response: ThhtpResponse = {
        success: true,
        statusCode: responseStatusCode,
        request: {
            ip: req.ip || null,
            method: req.method,
            url: req.originalUrl
        },
        message: responseMessage,
        data: data
    }
    // Log
    logger.info('CONTROLLER_RESPONSE', {
        meta: response
    })

    //Production env check
    if (config.ENV === EApplicationEnvionment.PRODUCTION) {
        delete response.request.ip
    }

    res.status(responseStatusCode).json(response)
}
