// backend/src/service/costTracker.ts
import costLogModel from '../model/costLogModel'

export interface ProviderResponse {
  tokensUsed: number
  cost: number
  latencyMs: number
}

export const trackCost = async (
  brandId: string,
  provider: string,
  queryText: string,
  { tokensUsed, cost, latencyMs }: ProviderResponse
) => {
  await costLogModel.create({
    brandId,
    provider,
    queryText,
    tokensUsed,
    cost,
    latencyMs
  })
}

// Admin endpoint: cost per brand per month
export const getMonthlyCostByBrand = async (brandId: string, month: Date) => {
  const start = new Date(month.getFullYear(), month.getMonth(), 1)
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  
  const logs = await costLogModel.find({
    brandId,
    createdAt: { $gte: start, $lt: end }
  })

  return {
    totalCost: logs.reduce((sum: number, l: any) => sum + (l.cost || 0), 0),
    totalCalls: logs.length,
    totalTokens: logs.reduce((sum: number, l: any) => sum + (l.tokensUsed || 0), 0),
    byProvider: logs.reduce((acc: Record<string, number>, l: any) => {
      acc[l.provider] = (acc[l.provider] || 0) + (l.cost || 0)
      return acc
    }, {})
  }
}