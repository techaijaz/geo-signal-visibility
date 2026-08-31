import { Request } from 'express'
import { THttpError } from '../types/types'
import responceseMessage from '../constent/responceseMessage'
import config from '../config/config'
import { EApplicationEnvionment } from '../constent/application'
import logger from './loger'

export default (error: Error | unknown, req: Request, errorStatusCode: number = 500): THttpError => {
    const errorObj: THttpError = {
        success: false,
        statusCode: errorStatusCode,
        request: {
            ip: req.ip || null,
            method: req.method,
            url: req.originalUrl
        },
        message: error instanceof Error ? error.message || responceseMessage.ERROR : responceseMessage.ERROR,
        data: error,
        trace: error instanceof Error ? { error: error.stack } : null
    }

    // Log
    logger.info('CONTROLLER_RESPONSE', {
        meta: errorObj
    })

    //Production env check
    if (config.ENV === EApplicationEnvionment.PRODUCTION) {
        delete errorObj.request.ip
        delete errorObj.trace
    }
    return errorObj
}
