// backend/src/service/auditService/contentService.ts
import axios from 'axios'
import * as cheerio from 'cheerio'

const calculateContentScore = (data: {
  hasDirectAnswer: boolean
  hasClearHierarchy: boolean
  hasFaqSection: boolean
  wordCount: number
  hasFreshnessSignal: boolean
}) => {
  let score = 0
  if (data.hasDirectAnswer) score += 25
  if (data.hasClearHierarchy) score += 20
  if (data.hasFaqSection) score += 25
  if (data.wordCount > 500) score += 15
  if (data.hasFreshnessSignal) score += 15
  return score
}

// Real content structure analysis
export const analyzeContentStructure = async (url: string, brandName: string) => {
  try {
    const res = await axios.get(url, { timeout: 15000 })
    const $ = cheerio.load(res.data)
    
    // 1. Check direct-answer presence in first paragraph
    const firstPara = $('main p').first().text().trim()
    const hasDirectAnswer = firstPara.length > 50 && firstPara.includes(brandName)
    
    // 2. H1/H2 structure
    const h1Count = $('h1').length
    const h2Count = $('h2').length
    const hasClearHierarchy = h1Count >= 1 && h2Count >= 2
    
    // 3. FAQ section detection
    const hasFaqSection = $('.faq, #faq, section[class*="faq"], details').length > 0
    
    // 4. Word count
    const text = $('main').text().replace(/\s+/g, ' ').trim()
    const wordCount = text.split(' ').length
    
    // 5. Dated content (freshness signal)
    const dateMatch = res.data.match(/datePublished["':\s]+[^"'<>]+/i)
    const hasFreshnessSignal = !!dateMatch
    
    return {
      hasDirectAnswer,
      h1Count,
      h2Count,
      hasClearHierarchy,
      hasFaqSection,
      wordCount,
      hasFreshnessSignal,
      score: calculateContentScore({
        hasDirectAnswer, hasClearHierarchy, hasFaqSection, wordCount, hasFreshnessSignal
      })
    }
  } catch {
    return {
      hasDirectAnswer: false,
      h1Count: 0,
      h2Count: 0,
      hasClearHierarchy: false,
      hasFaqSection: false,
      wordCount: 0,
      hasFreshnessSignal: false,
      score: 0
    }
  }
}