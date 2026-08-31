// backend/src/worker.ts
import databseService from './service/databseService'
import logger from './util/loger'
import { scanWorker, auditWorker, recommendationWorker } from './service/queueService'
import { startScheduler } from './service/schedulerService'

;(async () => {
    try {
        const connection = await databseService.connect()
        logger.info('WORKER DATABASE CONNECTION ESTABLISHED', {
            meta: { CONNECTION_NAME: connection.name }
        })

        // Initialize Cron Scheduler
        startScheduler()
        logger.info('CRON SCHEDULER STARTED')

        // Touch worker instances to ensure execution
        const activeWorkers = [scanWorker, auditWorker, recommendationWorker]

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
