// backend/src/service/queueService.ts
import { Queue, Worker, Job } from 'bullmq'
import aiService from './aiService'
import { auditService } from './auditService'
import logger from '../util/loger'

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
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

// 2. Define Interfaces
export interface ScanJobData {
  brandId: string
  triggeredAt?: string
}

export interface AuditJobData {
  brandId: string
  triggeredAt?: string
}

export interface RecommendationJobData {
  brandId: string
  triggeredAt?: string
}

// Helper to race enqueue with timeout
const enqueueWithTimeout = async <T>(
  queueAddCall: Promise<Job<T>>,
  timeoutMs = 1500
): Promise<Job<T> | null> => {
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
      scanQueue.add('ai-scan-job', {
        brandId,
        triggeredAt: new Date().toISOString()
      }, {
        jobId: `scan-${brandId}-${Date.now()}`
      }),
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
      auditQueue.add('brand-audit-job', {
        brandId,
        triggeredAt: new Date().toISOString()
      }, {
        jobId: `audit-${brandId}-${Date.now()}`
      }),
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
      recommendationQueue.add('ai-recommendation-job', {
        brandId,
        triggeredAt: new Date().toISOString()
      }, {
        jobId: `rec-${brandId}-${Date.now()}`
      }),
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

// 4. Define Workers
export const scanWorker = new Worker<ScanJobData>(
  'ai-scan',
  async (job: Job<ScanJobData>) => {
    const { brandId } = job.data
    logger.info(`[BullMQ Worker] Starting AI scan job for brand: ${brandId}`)
    const mentions = await aiService.scanMentionsWithAi(brandId)
    logger.info(`[BullMQ Worker] Completed AI scan job for brand: ${brandId} (${mentions.length} mentions processed)`)
    return { brandId, count: mentions.length }
  },
  { connection }
)

export const auditWorker = new Worker<AuditJobData>(
  'brand-audit',
  async (job: Job<AuditJobData>) => {
    const { brandId } = job.data
    logger.info(`[BullMQ Worker] Starting Audit job for brand: ${brandId}`)
    const audit = await auditService.runRealAudit(brandId)
    logger.info(`[BullMQ Worker] Completed Audit job for brand: ${brandId} (Health Score: ${audit.healthScore})`)
    return { brandId, healthScore: audit.healthScore }
  },
  { connection }
)

export const recommendationWorker = new Worker<RecommendationJobData>(
  'ai-recommendation',
  async (job: Job<RecommendationJobData>) => {
    const { brandId } = job.data
    logger.info(`[BullMQ Worker] Starting Recommendation job for brand: ${brandId}`)
    const databseService = (await import('./databseService')).default
    const recs = await databseService.rescanBrandRecommendations(brandId)
    logger.info(`[BullMQ Worker] Completed Recommendation job for brand: ${brandId} (${recs.length} recommendations generated)`)
    return { brandId, count: recs.length }
  },
  { connection }
)

// Attach worker error listeners to avoid unhandled crashes when Redis is disconnected
const attachWorkerErrorHandlers = (worker: Worker, name: string) => {
  worker.on('failed', (job, err) => {
    logger.error(`[BullMQ Worker Failure] ${name} Job ${job?.id} failed: ${err.message}`)
  })
  worker.on('error', (err) => {
    logger.warn(`[BullMQ Worker Connection Warning] ${name} Redis issue: ${err.message}`)
  })
}

attachWorkerErrorHandlers(scanWorker, 'ai-scan')
attachWorkerErrorHandlers(auditWorker, 'brand-audit')
attachWorkerErrorHandlers(recommendationWorker, 'ai-recommendation')

export default {
  scanQueue,
  auditQueue,
  recommendationQueue,
  enqueueScanJob,
  enqueueAuditJob,
  enqueueRecommendationJob,
  getJobStatus
}