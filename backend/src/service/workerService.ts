// backend/src/service/workerService.ts
// BullMQ workers — imported ONLY by worker.ts so API processes never consume jobs.
import { Worker, Job } from 'bullmq'
import aiService from './aiService'
import { auditService } from './auditService'
import logger from '../util/loger'
import config from '../config/config'
import {
    connection,
    ScanJobData,
    AuditJobData,
    RecommendationJobData,
    WeeklyReportJobData,
    CitationJobData,
    enqueueCitationJob
} from './queueService'
import { runCitationTick, runSchedulerTick, runWeeklyReportTick } from './schedulerService'
import { runCitationScan } from './citationService'
import citationRunModel from '../model/citationRunModel'
import { isoWeek } from '../util/isoWeek'
import { sendWeeklyReport } from './reportService/weeklyReport'

export const startWorkers = () => {
    const scanWorker = new Worker<ScanJobData>(
        'ai-scan',
        async (job: Job<ScanJobData>) => {
            const { brandId } = job.data
            logger.info(`[BullMQ Worker] Starting AI scan job for brand: ${brandId}`)
            const mentions = await aiService.scanMentionsWithAi(brandId)
            logger.info(`[BullMQ Worker] Completed AI scan job for brand: ${brandId} (${mentions.length} mentions processed)`)
            // A brand's first citation run follows its first scan, so "Where AI reads" isn't empty until Sunday
            if (config.CITATIONS_ENABLED && mentions.length && !(await citationRunModel.exists({ brandId }))) {
                await enqueueCitationJob(brandId, isoWeek())
            }
            return { brandId, count: mentions.length }
        },
        { connection, concurrency: config.WORKER_CONCURRENCY.SCAN }
    )

    const auditWorker = new Worker<AuditJobData>(
        'brand-audit',
        async (job: Job<AuditJobData>) => {
            const { brandId } = job.data
            logger.info(`[BullMQ Worker] Starting Audit job for brand: ${brandId}`)
            const audit = await auditService.runRealAudit(brandId)
            logger.info(`[BullMQ Worker] Completed Audit job for brand: ${brandId} (Health Score: ${audit.healthScore})`)
            return { brandId, healthScore: audit.healthScore }
        },
        { connection, concurrency: config.WORKER_CONCURRENCY.AUDIT }
    )

    const recommendationWorker = new Worker<RecommendationJobData>(
        'ai-recommendation',
        async (job: Job<RecommendationJobData>) => {
            const { brandId } = job.data
            logger.info(`[BullMQ Worker] Starting Recommendation job for brand: ${brandId}`)
            const databseService = (await import('./databseService')).default
            const recs = await databseService.rescanBrandRecommendations(brandId)
            logger.info(`[BullMQ Worker] Completed Recommendation job for brand: ${brandId} (${recs.length} recommendations generated)`)
            return { brandId, count: recs.length }
        },
        { connection, concurrency: config.WORKER_CONCURRENCY.RECOMMENDATION }
    )

    // Headless Chrome per job, so keep this low
    const weeklyReportWorker = new Worker<WeeklyReportJobData>(
        'weekly-report',
        async (job: Job<WeeklyReportJobData>) => sendWeeklyReport(job.data.brandId),
        { connection, concurrency: 2 }
    )

    // Gemini with Google Search is slow and paid: one brand at a time
    const citationWorker = new Worker<CitationJobData>('citation-scan', async (job: Job<CitationJobData>) => runCitationScan(job.data.brandId), {
        connection,
        concurrency: 1
    })

    // Each tick is a single job, so only one worker instance runs it even when scaled out
    const schedulerWorker = new Worker(
        'scan-scheduler',
        async (job: Job) =>
            job.name === 'weekly-report-tick' ? runWeeklyReportTick() : job.name === 'citation-tick' ? runCitationTick() : runSchedulerTick(),
        { connection }
    )

    const workers = [scanWorker, auditWorker, recommendationWorker, weeklyReportWorker, citationWorker, schedulerWorker]

    // Attach worker error listeners to avoid unhandled crashes when Redis is disconnected
    for (const worker of workers) {
        worker.on('failed', (job, err) => {
            logger.error(`[BullMQ Worker Failure] ${worker.name} Job ${job?.id} failed: ${err.message}`)
        })
        worker.on('error', (err) => {
            logger.warn(`[BullMQ Worker Connection Warning] ${worker.name} Redis issue: ${err.message}`)
        })
    }

    return workers
}
