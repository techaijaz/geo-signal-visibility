// backend/src/service/schedulerService.ts
import config from '../config/config'
import { getNextScanAt } from '../config/planLimits'
import orgModel from '../model/orgModel'
import brandModel from '../model/brandModel'
import mentionModel from '../model/mentionModel'
import databseService from './databseService'
import { enqueueScanJob, enqueueWeeklyReportJob, schedulerQueue } from './queueService'
import { WEEKLY_REPORT_PLANS } from './reportService/weeklyReport'
import { paymentService } from './paymentService'
import logger from '../util/loger'

const TICK_INTERVAL_MS = 5 * 60 * 1000
// If an enqueued scan never completes, the brand becomes due again after this lease
const SCAN_LEASE_MS = 60 * 60 * 1000

// One-time backfill for brands created before nextScanAt existed: derive it from their latest mention
const backfillUnscheduledBrands = async () => {
  const brands = await brandModel.find({ nextScanAt: null }).select('_id orgId').lean()
  if (brands.length === 0) return

  const orgs = await orgModel.find({ _id: { $in: brands.map((b) => b.orgId) } }).select('plan').lean()
  const planByOrg = new Map(orgs.map((o) => [o._id.toString(), o.plan]))

  for (const brand of brands) {
    const lastMention = await mentionModel.findOne({ brandId: brand._id }).sort({ extractedAt: -1 }).select('extractedAt').lean()
    const lastScannedAt = lastMention?.extractedAt ? new Date(lastMention.extractedAt) : null
    await brandModel.updateOne(
      { _id: brand._id },
      {
        $set: {
          lastScannedAt,
          nextScanAt: lastScannedAt ? getNextScanAt(planByOrg.get(brand.orgId.toString()), lastScannedAt) : new Date()
        }
      }
    )
  }
  logger.info(`[Scheduler] Backfilled nextScanAt for ${brands.length} brand(s)`)
}

export const runSchedulerTick = async () => {
  await paymentService.expireLapsedSubscriptions()
  await backfillUnscheduledBrands()

  const now = new Date()
  const dueBrands = await brandModel.find({ nextScanAt: { $lte: now } }).select('_id').lean()

  let enqueued = 0
  for (const brand of dueBrands) {
    const brandIdStr = brand._id.toString()
    // Push nextScanAt out as a lease; the scan itself sets the real next time when it finishes
    await brandModel.updateOne({ _id: brand._id }, { $set: { nextScanAt: new Date(now.getTime() + SCAN_LEASE_MS) } })

    const job = await enqueueScanJob(brandIdStr)
    if (!job) {
      if (config.ALLOW_INLINE_JOBS) {
        logger.warn(`[Scheduler] Queue unavailable, running inline scan for brand ${brandIdStr}`)
        await databseService.rescanBrandMentions(brandIdStr)
      } else {
        // The lease set above makes the next tick after it expires retry this brand
        logger.warn(`[Scheduler] Queue unavailable, skipping brand ${brandIdStr} until its lease expires`)
      }
    } else {
      enqueued++
    }
  }
  logger.info(`[Scheduler] Tick complete, ${enqueued} scan(s) enqueued`)
  return { enqueued }
}

// ISO week key like 2026-W40, used to dedupe weekly report jobs
const isoWeek = (d = new Date()) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// Monday 9:00 IST: queue one weekly report job per brand on a paid plan
export const runWeeklyReportTick = async () => {
  const orgs = await orgModel.find({ plan: { $in: WEEKLY_REPORT_PLANS } }).select('_id').lean()
  const brands = await brandModel.find({ orgId: { $in: orgs.map((o) => o._id) } }).select('_id').lean()
  const week = isoWeek()
  let queued = 0
  for (const brand of brands) {
    if (await enqueueWeeklyReportJob(brand._id.toString(), week)) queued++
  }
  logger.info(`[Scheduler] Weekly report tick: ${queued}/${brands.length} brand report(s) queued for ${week}`)
  return { queued }
}

// Idempotent: every worker instance upserts the same scheduler ids, so Redis holds exactly one of each
export const startScheduler = async () => {
  await schedulerQueue.upsertJobScheduler(
    'scan-scheduler-tick',
    { every: TICK_INTERVAL_MS },
    { name: 'scheduler-tick' }
  )
  await schedulerQueue.upsertJobScheduler(
    'weekly-report-tick',
    { pattern: '0 9 * * 1', tz: 'Asia/Kolkata' },
    { name: 'weekly-report-tick' }
  )
}
