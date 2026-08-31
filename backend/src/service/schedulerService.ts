// backend/src/service/schedulerService.ts
import cron from 'node-cron'
import { PlanName } from '../config/planLimits'
import orgModel from '../model/orgModel'
import brandModel from '../model/brandModel'
import mentionModel from '../model/mentionModel'
import databseService from './databseService'
import { enqueueScanJob } from './queueService'

const SCHEDULES: Record<PlanName, string> = {
  free: '0 0 * * 1',        // Weekly Monday
  starter: '0 0 * * 1',     // Weekly Monday
  growth: '0 0 * * *',      // Daily
  agency: '0 0,12 * * *'    // Twice daily
}

const isDue = (lastScanDate: Date | null, cronSchedule: string): boolean => {
  if (!lastScanDate) return true
  const now = Date.now()
  const diffHours = (now - new Date(lastScanDate).getTime()) / (1000 * 60 * 60)
  if (cronSchedule.includes('0 0,12')) return diffHours >= 12
  if (cronSchedule.includes('0 0 * * *')) return diffHours >= 24
  return diffHours >= 168 // 7 days
}

export const startScheduler = () => {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const orgs = await orgModel.find({
        plan: { $in: ['free', 'starter', 'growth', 'agency'] }
      })

      for (const org of orgs) {
        const brands = await brandModel.find({ orgId: org._id })
        for (const brand of brands) {
          const planKey = (org.plan || 'starter') as PlanName
          const lastMention = await mentionModel.findOne({ brandId: brand._id }).sort({ extractedAt: -1 })

          if (isDue(lastMention?.extractedAt ? new Date(lastMention.extractedAt) : null, SCHEDULES[planKey])) {
            const brandIdStr = brand._id.toString()
            const job = await enqueueScanJob(brandIdStr)
            if (!job) {
              // Fallback to inline scan if queue service / Redis is unreachable
              console.warn(`[Scheduler] Queue unavailable, running inline scan for brand ${brandIdStr}`)
              await databseService.rescanBrandMentions(brandIdStr)
            } else {
              console.log(`[Scheduler] Enqueued scheduled scan for brand ${brandIdStr}`)
            }
          }
        }
      }
    } catch (err) {
      console.error('Error in scheduler cron job:', err)
    }
  })
}