// backend/src/service/reportService/pdfService.ts
import puppeteer from 'puppeteer'

export const generateReportPdf = async (reportData: {
  brandName: string
  reportDate: string
  score: number
  trendPoints: number[]
  modelStats: Array<{ name: string; score: number }>
  recommendations: Array<{ text: string; isCompleted: boolean }>
}): Promise<Buffer> => {
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', 'Segoe UI', sans-serif; padding: 40px; color: #1a1a2e; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .brand { font-size: 24px; font-weight: 700; }
        .score-ring { width: 120px; height: 120px; border-radius: 50%; 
          background: conic-gradient(#FFC857 ${reportData.score * 3.6}deg, #eee 0deg);
          display: flex; align-items: center; justify-content: center; }
        .score-ring-inner { width: 90px; height: 90px; border-radius: 50%; background: white;
          display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; }
        .section { margin-bottom: 30px; }
        .section-title { font-size: 16px; font-weight: 600; color: #666; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; }
        td, th { padding: 8px 12px; text-align: left; font-size: 13px; }
        th { border-bottom: 2px solid #eee; color: #888; }
        .done { color: #2e7d32; }
        .pending { color: #d32f2f; }
        .sparkline { width: 100%; height: 80px; background: #fafafa; border-radius: 8px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="brand">${reportData.brandName}</div>
          <div style="color:#888;font-size:13px;margin-top:4px">${reportData.reportDate}</div>
        </div>
        <div class="score-ring"><div class="score-ring-inner">${reportData.score}</div></div>
      </div>
      
      <div class="section">
        <div class="section-title">Model-wise Visibility</div>
        <table>
          ${reportData.modelStats.map(m => `
            <tr><td>${m.name}</td><td style="text-align:right;font-weight:600">${m.score}%</td></tr>
          `).join('')}
        </table>
      </div>
      
      <div class="section">
        <div class="section-title">Recommended Actions</div>
        ${reportData.recommendations.filter(r => !r.isCompleted).slice(0, 6).map(r => `
          <div style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px">
            <span style="color:#d32f2f">☐</span> ${r.text}
          </div>
        `).join('')}
      </div>
    </body>
    </html>
  `

  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'domcontentloaded' })
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '40px', bottom: '40px', left: '40px', right: '40px' }
  })
  await browser.close()
  return Buffer.from(pdf)
}