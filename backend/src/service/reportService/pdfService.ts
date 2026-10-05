// backend/src/service/reportService/pdfService.ts
// Renders a report snapshot (see reportData.ts) to an A4 PDF with headless Chrome.
import puppeteer, { type Browser } from 'puppeteer'
import { IReportData } from './reportData'

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }) : 'not scanned yet'

const badgeClass = (b: string) => (b === 'badge-ok' ? 'ok' : b === 'badge-bad' ? 'bad' : 'warn')

const trendSvg = (points: IReportData['trend']) => {
    if (points.length < 2) return ''
    const W = 640,
        H = 140,
        P = 16
    const x = (i: number) => P + (i * (W - 2 * P)) / (points.length - 1)
    const y = (v: number) => H - P - (v / 100) * (H - 2 * P)
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ')
    const area = `${d} L${x(points.length - 1)},${H - P} L${x(0)},${H - P} Z`
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
      ${[0, 50, 100].map((g) => `<line x1="${P}" x2="${W - P}" y1="${y(g)}" y2="${y(g)}" stroke="#E4E9E7"/>`).join('')}
      <path d="${area}" fill="#FFC857" opacity=".22"/>
      <path d="${d}" fill="none" stroke="#0F2629" stroke-width="2.5" stroke-linejoin="round"/>
      ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.score)}" r="3" fill="#0F2629"/>`).join('')}
    </svg>
    <div class="axis"><span>${esc(fmtDate(points[0].date))}</span><span>${esc(fmtDate(points[points.length - 1].date))}</span></div>`
}

export const renderReportHtml = (r: IReportData) => {
    const delta = r.previousVisibility === null ? null : r.visibility - r.previousVisibility
    const deltaText =
        delta === null
            ? 'First scan in this report history'
            : delta === 0
              ? 'No change since the previous scan'
              : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} points since the previous scan`
    const totalAnswers = r.engines.reduce((a, e) => a + e.total, 0)
    const namedIn = r.engines.reduce((a, e) => a + e.mentioned, 0)

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(r.brandName)} AI visibility report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Liberation Sans', 'Noto Sans', 'Noto Sans Devanagari', Arial, sans-serif; color: #0F2629; font-size: 11pt; line-height: 1.45; }
  h1 { font-size: 24pt; letter-spacing: -0.02em; line-height: 1.1; }
  h2 { font-size: 13pt; margin: 22px 0 10px; padding-top: 12px; border-top: 2px solid #0F2629; }
  .muted { color: #52676A; }
  .small { font-size: 9pt; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .logo { font-weight: 800; font-size: 10pt; display: flex; align-items: center; gap: 6px; margin-bottom: 14px; }
  .bars { display: inline-flex; align-items: flex-end; gap: 2px; }
  .bars i { display: block; width: 4px; background: #FFC857; border-radius: 1px; }
  .score { text-align: right; }
  .score b { font-size: 38pt; line-height: 1; display: block; letter-spacing: -0.03em; }
  .mark { background: #FFC857; padding: 0 4px; border-radius: 3px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #E4E9E7; vertical-align: top; font-size: 10pt; }
  th { color: #52676A; font-weight: 600; font-size: 9pt; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .meter { height: 8px; background: #E4E9E7; border-radius: 4px; overflow: hidden; }
  .meter span { display: block; height: 100%; background: #0F2629; border-radius: 4px; }
  .meter.you span { background: #FFC857; }
  .cell { text-align: center; font-weight: 700; }
  .cell.hit { color: #1F8A5B; }
  .cell.miss { color: #C8443A; font-weight: 400; }
  .axis { display: flex; justify-content: space-between; font-size: 8.5pt; color: #52676A; }
  .chip { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 8.5pt; font-weight: 700; }
  .chip.ok { background: #DDF1E6; color: #1F8A5B; }
  .chip.bad { background: #F8E1DE; color: #C8443A; }
  .chip.warn { background: #FFF1CC; color: #7A5A00; }
  .cols { display: flex; gap: 24px; }
  .cols > div { flex: 1; }
  ol.recs { padding-left: 18px; }
  ol.recs li { margin-bottom: 8px; }
  .impact { font-size: 8.5pt; font-weight: 700; color: #52676A; }
  .avoid-break { break-inside: avoid; }
</style></head>
<body>
  <div class="logo"><span class="bars"><i style="height:5px"></i><i style="height:8px"></i><i style="height:11px"></i></span>Signal AI</div>
  <div class="top">
    <div>
      <h1>${esc(r.brandName)}</h1>
      <p class="muted">AI visibility report · ${esc(r.website)}</p>
      <p class="muted small">Scan of ${esc(fmtDate(r.scannedAt))}. Report created ${esc(fmtDate(r.generatedAt))}.</p>
    </div>
    <div class="score">
      <b>${r.visibility}%</b>
      <span class="muted small">visibility across ${r.engines.length} AI assistant${r.engines.length === 1 ? '' : 's'}</span><br/>
      <span class="small">${esc(deltaText)}</span>
    </div>
  </div>

  <p style="margin-top:14px">${
      totalAnswers
          ? `<span class="mark">${esc(r.brandName)}</span> was named in <b>${namedIn} of ${totalAnswers}</b> AI answers to the questions you track.`
          : 'No scan results yet. Your first scan runs automatically after you add questions.'
  }</p>

  ${
      r.engines.length
          ? `
  <div class="avoid-break">
  <h2>By AI assistant</h2>
  <table>
    <thead><tr><th>Assistant</th><th style="width:40%">Share of answers naming you</th><th class="num">Score</th><th class="num">Named in</th><th class="num">Avg. position</th></tr></thead>
    <tbody>
      ${r.engines
          .map(
              (e) => `<tr>
        <td><b>${esc(e.name)}</b></td>
        <td><div class="meter"><span style="width:${e.score}%"></span></div></td>
        <td class="num"><b>${e.score}%</b></td>
        <td class="num">${e.mentioned}/${e.total}</td>
        <td class="num">${e.avgPosition === null ? '–' : `#${e.avgPosition}`}</td>
      </tr>`
          )
          .join('')}
    </tbody>
  </table>
  </div>`
          : ''
  }

  ${r.trend.length >= 2 ? `<div class="avoid-break"><h2>Visibility over the last ${r.trend.length} scans</h2>${trendSvg(r.trend)}</div>` : ''}

  ${
      r.questions.length
          ? `
  <h2>Question by question</h2>
  <p class="muted small" style="margin-bottom:8px">Your position in each AI's answer. A dash means you were not named.</p>
  <table>
    <thead><tr><th>Question</th>${r.engines.map((e) => `<th class="num">${esc(e.name)}</th>`).join('')}</tr></thead>
    <tbody>
      ${r.questions
          .map(
              (q) =>
                  `<tr class="avoid-break"><td>${esc(q.text)}</td>${q.results
                      .map((c) => (c.mentioned ? `<td class="cell hit">${c.position ? `#${c.position}` : '✓'}</td>` : '<td class="cell miss">–</td>'))
                      .join('')}</tr>`
          )
          .join('')}
    </tbody>
  </table>`
          : ''
  }

  <div class="avoid-break">
  <h2>Share of voice</h2>
  ${
      r.shareOfVoice && r.shareOfVoice.length > 1
          ? `
  <p class="muted small" style="margin-bottom:8px">How often each brand is named across these AI answers.</p>
  <table><tbody>
    ${r.shareOfVoice
        .map(
            (s) => `<tr>
      <td style="width:30%"><b>${esc(s.name)}</b>${s.isYou ? ' <span class="muted">(you)</span>' : ''}</td>
      <td><div class="meter ${s.isYou ? 'you' : ''}"><span style="width:${s.pct}%"></span></div></td>
      <td class="num" style="width:12%"><b>${s.pct}%</b></td>
      <td class="num muted" style="width:14%">${s.count} answer${s.count === 1 ? '' : 's'}</td>
    </tr>`
        )
        .join('')}
  </tbody></table>`
          : `<p class="muted">${
                r.shareOfVoice
                    ? 'Add competitors in Settings to compare how often AI names them against you.'
                    : 'Share of voice appears from your next scan.'
            }</p>`
  }
  </div>

  ${
      r.audit
          ? `
  <div class="avoid-break">
  <h2>Can AI read your site? <span class="muted" style="font-weight:400">Site health ${r.audit.healthScore}/100</span></h2>
  <div class="cols">
    <div><table><thead><tr><th>AI crawler</th><th class="num">Status</th></tr></thead><tbody>
      ${r.audit.crawlers.map((c) => `<tr><td>${esc(c.name)}</td><td class="num"><span class="chip ${badgeClass(c.badgeType)}">${esc(c.status)}</span></td></tr>`).join('')}
    </tbody></table></div>
    ${
        r.audit.schema.length
            ? `<div><table><thead><tr><th>Structured data</th><th class="num">Status</th></tr></thead><tbody>
      ${r.audit.schema.map((c) => `<tr><td>${esc(c.name)}</td><td class="num"><span class="chip ${badgeClass(c.badgeType)}">${esc(c.status)}</span></td></tr>`).join('')}
    </tbody></table></div>`
            : ''
    }
  </div>
  </div>`
          : ''
  }

  ${
      r.recommendations.length
          ? `
  <div class="avoid-break">
  <h2>What to do next</h2>
  <ol class="recs">
    ${r.recommendations.map((x) => `<li>${esc(x.text)} <span class="impact">${esc(x.impact)}</span></li>`).join('')}
  </ol>
  </div>`
          : ''
  }

  <p class="muted small" style="margin-top:22px">AI answers can vary from one request to the next. This report shows the answers from the scan dated above.</p>
</body></html>`
}

// At most two Chrome instances at once so report bursts can't exhaust the container's memory
const MAX_CONCURRENT = 2
let active = 0
const waiting: Array<() => void> = []
const acquire = async () => {
    while (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r))
    active++
}
const release = () => {
    active--
    waiting.shift()?.()
}

// One headless Chrome for the length of fn, within the concurrency limit above
export const withBrowser = async <T>(fn: (browser: Browser) => Promise<T>): Promise<T> => {
    await acquire()
    const browser = await puppeteer
        .launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        })
        .catch((err) => {
            release()
            throw err
        })
    try {
        return await fn(browser)
    } finally {
        await browser.close()
        release()
    }
}

export const generateReportPdf = async (data: IReportData): Promise<Buffer> =>
    withBrowser(async (browser) => {
        const page = await browser.newPage()
        await page.setContent(renderReportHtml(data), { waitUntil: 'domcontentloaded' })
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '36px', bottom: '48px', left: '40px', right: '40px' },
            displayHeaderFooter: true,
            headerTemplate: '<span></span>',
            footerTemplate: `<div style="font-size:8px;color:#52676A;width:100%;padding:0 40px;display:flex;justify-content:space-between;font-family:Arial,sans-serif">
              <span>${esc(data.brandName)} · Signal AI</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`
        })
        return Buffer.from(pdf)
    })
