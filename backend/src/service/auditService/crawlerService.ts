// backend/src/service/auditService/crawlerService.ts
import axios from 'axios'

export interface CrawlerAccessResult {
  userAgent: string
  allowed: boolean | null
  rule?: string
}

export const extractDomain = (url: string): string => {
  if (!url) return ''
  return url.replace(/https?:\/\//i, '').replace(/\/.*$/, '').trim()
}

export const fetchRobotsTxt = async (domain: string): Promise<string | null> => {
  if (!domain) return null
  try {
    const res = await axios.get(`https://${domain}/robots.txt`, {
      timeout: 10000,
      headers: { 'User-Agent': 'SignalBot/1.0 (+https://signal-ai.com/bot)' }
    })
    return res.data
  } catch (error) {
    try {
      const res = await axios.get(`http://${domain}/robots.txt`, { timeout: 8000 })
      return res.data
    } catch {
      return null
    }
  }
}

export const fetchLlmsTxt = async (domain: string): Promise<string | null> => {
  if (!domain) return null
  try {
    const res = await axios.get(`https://${domain}/llms.txt`, { timeout: 5000 })
    return res.data
  } catch {
    return null
  }
}

export const fetchHomePageMeta = async (domain: string): Promise<any | null> => {
  if (!domain) return null
  try {
    const res = await axios.get(`https://${domain}`, { timeout: 10000 })
    return res.data
  } catch {
    return null
  }
}

export const parseRobotsForCrawler = (
  robotsTxt: string,
  crawler: 'GPTBot' | 'ClaudeBot' | 'Google-Extended' | 'CCBot' | 'PerplexityBot'
): CrawlerAccessResult => {
  const groups = robotsTxt.split(/User-agent:/i).slice(1)
  
  let agentRules: string[] = []
  let wildcardRules: string[] = []

  for (const group of groups) {
    const lines = group.split('\n').map(l => l.trim()).filter(Boolean)
    const agentName = lines[0]?.toLowerCase() || ''
    
    if (agentName.includes(crawler.toLowerCase())) {
      agentRules = lines.slice(1)
    } else if (agentName === '*') {
      wildcardRules = lines.slice(1)
    }
  }

  const rules = agentRules.length > 0 ? agentRules : wildcardRules
  const allowRule = rules.find(r => r.toLowerCase().startsWith('allow:'))
  const disallowRule = rules.find(r => r.toLowerCase().startsWith('disallow:'))

  if (!disallowRule) return { userAgent: crawler, allowed: true }
  if (disallowRule === 'Disallow:') return { userAgent: crawler, allowed: true }
  if (disallowRule === 'Disallow: /') return { userAgent: crawler, allowed: false, rule: disallowRule }
  if (allowRule) return { userAgent: crawler, allowed: true, rule: allowRule }
  
  return { userAgent: crawler, allowed: false, rule: disallowRule }
}