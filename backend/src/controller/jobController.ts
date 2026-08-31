import { Request, Response, NextFunction } from 'express'
import { getJobStatus } from '../service/queueService'
import httpResponse from '../util/httpResponse'
import httpError from '../util/httpError'
import responceseMessage from '../constent/responceseMessage'

export default {
    getJobStatus: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { queueName, jobId } = req.params
            const jobDetails = await getJobStatus(queueName, jobId)
            httpResponse(req, res, 200, responceseMessage.SUCCESS, jobDetails)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    }
}
