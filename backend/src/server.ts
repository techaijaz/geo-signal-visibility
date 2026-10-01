import config from './config/config'
import app from './app'
import logger from './util/loger'
import databseService from './service/databseService'
import { initRateLimiter } from './config/rateLimiter'

const server = app.listen(config.PORT, () => {})

// Docker/Kubernetes send SIGTERM before stopping a container: finish in-flight requests, then exit
const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down API`)
    server.close(() => {
        databseService
            .disconnect()
            .catch(() => undefined)
            .finally(() => process.exit(0))
    })
    // Hard stop if connections don't drain in time (Kubernetes default grace period is 30s)
    setTimeout(() => process.exit(0), 25000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

;(async () => {
    try {
        const connection = await databseService.connect()

        logger.info('DATABASE CONNECTION', {
            meta: {
                CONNECTION_NAME: connection.name
            }
        })

        initRateLimiter(connection)
        logger.info('RATE LIMITER INITIATE')

        logger.info('APPLICATION STARTED', {
            meta: {
                PORT: config.PORT,
                SERVVER_URL: config.SERVER_URL
            }
        })
    } catch (error) {
        logger.error('APPLICATION STARTED', { meta: error })
        server.close(() => {
            if (error) {
                logger.error('APPLICATION STARTED', { meta: error })
            }
            process.exit(1)
        })
    }
})()
