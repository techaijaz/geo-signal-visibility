// backend/src/worker.ts
import databseService from './service/databseService'
import logger from './util/loger'
import { startWorkers } from './service/workerService'
import { startScheduler } from './service/schedulerService'
import { startHealthServer } from './util/health'

const HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT) || 8081

;(async () => {
    try {
        const connection = await databseService.connect()
        logger.info('WORKER DATABASE CONNECTION ESTABLISHED', {
            meta: { CONNECTION_NAME: connection.name }
        })

        const activeWorkers = startWorkers()
        const healthServer = startHealthServer(HEALTH_PORT)

        // SIGTERM (container stop / pod eviction): let running jobs finish, then exit. Unfinished jobs
        // are picked up again by another worker because BullMQ only removes a job once it completes
        const shutdown = async (signal: string) => {
            logger.info(`${signal} received, closing workers`)
            healthServer.close()
            setTimeout(() => process.exit(0), 25000).unref()
            await Promise.allSettled(activeWorkers.map((w) => w.close()))
            await databseService.disconnect().catch(() => undefined)
            process.exit(0)
        }
        process.on('SIGTERM', () => void shutdown('SIGTERM'))
        process.on('SIGINT', () => void shutdown('SIGINT'))

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
