// backend/src/worker.ts
import databseService from './service/databseService'
import logger from './util/loger'
import { startWorkers } from './service/workerService'
import { startScheduler } from './service/schedulerService'

;(async () => {
    try {
        const connection = await databseService.connect()
        logger.info('WORKER DATABASE CONNECTION ESTABLISHED', {
            meta: { CONNECTION_NAME: connection.name }
        })

        const activeWorkers = startWorkers()

        // Register the repeating scheduler tick in Redis (safe to call from every worker instance)
        await startScheduler()
        logger.info('SCAN SCHEDULER REGISTERED')

        logger.info('BULLMQ WORKERS ACTIVE AND READY FOR JOBS', {
            meta: {
                workers: activeWorkers.map(w => w.name)
            }
        })
    } catch (error) {
        logger.error('FAILED TO START WORKER PROCESS', { meta: error })
        process.exit(1)
    }
})()
