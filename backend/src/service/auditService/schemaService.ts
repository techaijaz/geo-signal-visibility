// backend/src/service/auditService/schemaService.ts
import axios from 'axios'
import * as cheerio from 'cheerio'

// Real schema.org JSON-LD scanner
export const extractSchemaMarkup = async (url: string): Promise<string[]> => {
  try {
    const res = await axios.get(url, { timeout: 15000 })
    const $ = cheerio.load(res.data)
    const foundSchemas: string[] = []

    $('script[type="application/ld+json"]').each((_: any, el: any) => {
      const raw = $(el).html() || ''
      try {
        const data = JSON.parse(raw)
        const types = Array.isArray(data['@type'])
          ? data['@type']
          : data['@type'] ? [data['@type']] : []
        
        types.forEach((t: string) => {
          if (['Product', 'Organization', 'FAQPage', 'Review', 'BreadcrumbList', 'Service', 'SoftwareApplication']
            .includes(t)) {
            foundSchemas.push(t)
          }
        })
      } catch { /* invalid JSON -> skip */ }
    })

    return [...new Set(foundSchemas)]
  } catch {
    return []
  }
}