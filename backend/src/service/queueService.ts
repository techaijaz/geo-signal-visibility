// backend/src/service/queueService.ts
import { Queue, Job } from 'bullmq'
import logger from '../util/loger'

export const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    connectTimeout: 2000,
    retryStrategy: (times: number) => {
        if (times > 2) return null
        return Math.min(times * 100, 500)
    }
}

const defaultJobOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 1000
}

// 1. Define Queues
export const scanQueue = new Queue('ai-scan', { connection, defaultJobOptions })
export const auditQueue = new Queue('brand-audit', { connection, defaultJobOptions })
export const recommendationQueue = new Queue('ai-recommendation', { connection, defaultJobOptions })
export const weeklyReportQueue = new Queue('weekly-report', { connection, defaultJobOptions })
export const schedulerQueue = new Queue('scan-scheduler', { connection, defaultJobOptions: { removeOnComplete: 100, removeOnFail: 100 } })

// 2. Define Interfaces
export interface ScanJobData {
    brandId: string
    triggeredAt?: string
}

export interface AuditJobData {
    brandId: string
    triggeredAt?: string
}

export interface WeeklyReportJobData {
    brandId: string
    week: string
}

export interface RecommendationJobData {
    brandId: string
    triggeredAt?: string
}

// Helper to race enqueue with timeout
const enqueueWithTimeout = async <T>(queueAddCall: Promise<Job<T>>, timeoutMs = 1500): Promise<Job<T> | null> => {
    let timer: NodeJS.Timeout | null = null
    const timeoutPromise = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs)
    })

    try {
        const result = await Promise.race([queueAddCall, timeoutPromise])
        if (timer) clearTimeout(timer)
        return result
    } catch {
        if (timer) clearTimeout(timer)
        return null
    }
}

// 3. Enqueue Helpers
export const enqueueScanJob = async (brandId: string): Promise<Job<ScanJobData> | null> => {
    try {
        const job = await enqueueWithTimeout(
            scanQueue.add(
                'ai-scan-job',
                {
                    brandId,
                    triggeredAt: new Date().toISOString()
                },
                {
                    jobId: `scan-${brandId}-${Date.now()}`,
                    // Skip if a scan for this brand is already waiting/running (avoids double AI spend)
                    deduplication: { id: `scan-${brandId}` }
                }
            ),
            1500
        )
        if (job) {
            logger.info(`[BullMQ Queue] Enqueued AI scan job for brand ${brandId} (Job ID: ${job.id})`)
            return job
        }
        logger.warn(`[BullMQ Queue] Queue offline or timed out for brand ${brandId}, returning null for fallback`)
        return null
    } catch (err) {
        logger.error(`[BullMQ Queue Error] Failed to enqueue scan job for brand ${brandId}:`, { meta: err })
        return null
    }
}

export const enqueueAuditJob = async (brandId: string): Promise<Job<AuditJobData> | null> => {
    try {
        const job = await enqueueWithTimeout(
            auditQueue.add(
                'brand-audit-job',
                {
                    brandId,
                    triggeredAt: new Date().toISOString()
                },
                {
                    jobId: `audit-${brandId}-${Date.now()}`
                }
            ),
            1500
        )
        if (job) {
            logger.info(`[BullMQ Queue] Enqueued Audit job for brand ${brandId} (Job ID: ${job.id})`)
            return job
        }
        logger.warn(`[BullMQ Queue] Queue offline or timed out for brand ${brandId}, returning null for fallback`)
        return null
    } catch (err) {
        logger.error(`[BullMQ Queue Error] Failed to enqueue audit job for brand ${brandId}:`, { meta: err })
        return null
    }
}

export const enqueueRecommendationJob = async (brandId: string): Promise<Job<RecommendationJobData> | null> => {
    try {
        const job = await enqueueWithTimeout(
            recommendationQueue.add(
                'ai-recommendation-job',
                {
                    brandId,
                    triggeredAt: new Date().toISOString()
                },
                {
                    jobId: `rec-${brandId}-${Date.now()}`
                }
            ),
            1500
        )
        if (job) {
            logger.info(`[BullMQ Queue] Enqueued Recommendation job for brand ${brandId} (Job ID: ${job.id})`)
            return job
        }
        logger.warn(`[BullMQ Queue] Queue offline or timed out for brand ${brandId}, returning null for fallback`)
        return null
    } catch (err) {
        logger.error(`[BullMQ Queue Error] Failed to enqueue recommendation job for brand ${brandId}:`, { meta: err })
        return null
    }
}

// One job per brand per ISO week (jobId), so a repeated Monday tick never queues the same email twice
export const enqueueWeeklyReportJob = async (brandId: string, week: string): Promise<Job<WeeklyReportJobData> | null> => {
    try {
        return await enqueueWithTimeout(weeklyReportQueue.add('weekly-report-job', { brandId, week }, { jobId: `weekly-${brandId}-${week}` }), 1500)
    } catch (err) {
        logger.error(`[BullMQ Queue Error] Failed to enqueue weekly report for brand ${brandId}:`, { meta: err })
        return null
    }
}

export const getJobStatus = async (queueName: string, jobId: string) => {
    try {
        let queue: Queue | null = null
        if (queueName === 'ai-scan') queue = scanQueue
        else if (queueName === 'brand-audit') queue = auditQueue
        else if (queueName === 'ai-recommendation') queue = recommendationQueue

        if (!queue) return { status: 'unknown_queue' }

        const job = await queue.getJob(jobId)
        if (!job) return { status: 'not_found' }

        const state = await job.getState()
        return {
            id: job.id,
            name: job.name,
            data: job.data,
            state,
            progress: job.progress,
            failedReason: job.failedReason,
            returnvalue: job.returnvalue,
            finishedOn: job.finishedOn
        }
    } catch (err: unknown) {
        const error = err as Error
        logger.error(`[BullMQ getJobStatus Error] ${queueName}/${jobId}: ${error.message}`, { meta: err })
        return { status: 'error', message: error.message }
    }
}

export default {
    scanQueue,
    auditQueue,
    recommendationQueue,
    schedulerQueue,
    enqueueScanJob,
    enqueueAuditJob,
    enqueueRecommendationJob,
    getJobStatus
}
