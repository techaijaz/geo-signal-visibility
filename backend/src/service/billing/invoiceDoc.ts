import emailService from '../emailService'
import { layout } from '../emailTemplates'
import { withBrowser } from '../reportService/pdfService'
import { InvoiceModel } from '../../model/billingModel'
import config from '../../config/config'
import { getSeller, type ISeller } from './seller'
import type { IInvoice } from '../../types/billingTypes'

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const rupees = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`
const day = (d?: Date | string) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : ''

export const invoiceFileName = (inv: IInvoice) => `Invoice-${inv.invoiceNumber.replace(/\//g, '-')}.pdf`

// ─── Amount in words (Indian numbering: thousand, lakh, crore) ───────────────
const ONES = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen'
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
const belowHundred = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`)
const belowThousand = (n: number) =>
    [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', n % 100 ? belowHundred(n % 100) : ''].filter(Boolean).join(' ')

export const amountInWords = (rupeesAmount: number) => {
    let n = Math.round(rupeesAmount)
    if (n === 0) return 'Rupees Zero Only'
    const parts: string[] = []
    const crore = Math.floor(n / 1e7)
    n %= 1e7
    const lakh = Math.floor(n / 1e5)
    n %= 1e5
    const thousand = Math.floor(n / 1000)
    n %= 1000
    if (crore) parts.push(`${belowThousand(crore)} Crore`)
    if (lakh) parts.push(`${belowHundred(lakh)} Lakh`)
    if (thousand) parts.push(`${belowHundred(thousand)} Thousand`)
    if (n) parts.push(belowThousand(n))
    return `Rupees ${parts.join(' ')} Only`
}

// Razorpay's payment.method → the line printed on the invoice
const METHOD_NAMES: Record<string, string> = {
    upi: 'UPI',
    card: 'Card',
    netbanking: 'Netbanking',
    wallet: 'Wallet',
    emi: 'EMI',
    paylater: 'Pay Later'
}
export const paymentMethodLabel = (method?: string) => (method && METHOD_NAMES[method] ? `${METHOD_NAMES[method]} (Razorpay)` : 'Razorpay')

// A4 invoice: header band, invoice details, seller and buyer, item table, totals with the amount in
// words, payment notes and a footer. "INVOICE" (never "Tax Invoice") while the seller has no GSTIN
export const renderInvoiceHtml = (inv: IInvoice, fallbackSeller: ISeller) => {
    const seller = inv.seller || fallbackSeller
    const fromNow = inv.seller ? '' : ' <span class="muted">(details at download time)</span>'
    const period = inv.period?.start ? `${day(inv.period.start)} – ${day(inv.period.end)}` : '—'
    const item = inv.items?.[0]?.description || `Signal AI ${inv.plan} plan`
    const issued = day(inv.paidAt || inv.createdAt)
    const row = (k: string, v: string) => `<tr><td class="k">${k}</td><td>${v}</td></tr>`
    return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:A4;margin:0}
*{box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;color:#0F2629;font-size:12px;margin:0}
.page{min-height:297mm;display:flex;flex-direction:column}
.band{background:#0F2629;color:#F2F4F1;padding:26px 40px;display:flex;justify-content:space-between;align-items:center}
.brand{font-size:20px;font-weight:bold}.brand .dot{display:inline-block;width:11px;height:11px;border-radius:6px;background:#FFC857;margin-right:8px}
.brand small{display:block;font-size:11px;font-weight:normal;color:#A9BDBF;margin-top:4px}
.type{text-align:right}.type h1{margin:0;font-size:24px;letter-spacing:.12em}.type div{font-size:11px;color:#FFC857;margin-top:4px}
.amber{height:5px;background:#FFC857}
.body{padding:28px 40px;flex:1}
.grid{display:flex;gap:16px}.grid>div{flex:1}.grid>div:first-child{flex:1.4}
.card{border:1px solid #D3DBD8;border-radius:8px;padding:14px 16px;line-height:1.5}
.label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#52676A;margin-bottom:6px;font-weight:bold}
.muted{color:#52676A}
table.kv{width:100%;border-collapse:collapse}table.kv td{padding:2px 0;vertical-align:top}table.kv td.k{color:#52676A;white-space:nowrap;padding-right:12px}
table.items{width:100%;border-collapse:collapse;margin-top:22px}
table.items th{background:#F2F4F1;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#52676A;text-align:left;padding:9px 10px;border-bottom:1px solid #D3DBD8}
table.items td{padding:12px 10px;border-bottom:1px solid #E4E9E7;vertical-align:top}.r{text-align:right}
.totals{display:flex;gap:20px;margin-top:18px;align-items:flex-start}.totals .words{flex:1;padding-top:6px}.totals .sum{width:260px}
.sum table{width:100%;border-collapse:collapse}.sum td{padding:7px 10px}.sum tr.grand td{background:#0F2629;color:#F2F4F1;font-weight:bold;font-size:14px}
.paid{display:inline-block;margin-top:8px;padding:2px 10px;border-radius:12px;background:#E6F4EA;color:#1E7A46;font-weight:bold;font-size:10px;letter-spacing:.08em}
.notes{margin-top:24px}.notes p{margin:4px 0}
.foot{border-top:1px solid #D3DBD8;padding:14px 40px;font-size:10px;color:#52676A;display:flex;justify-content:space-between;gap:20px}
</style></head><body><div class="page">
<div class="band">
  <div class="brand"><span class="dot"></span>Signal AI<small>AI search visibility for D2C brands</small></div>
  <div class="type"><h1>INVOICE</h1><div>${seller.gstin ? 'GST registered' : 'Not registered under GST'}</div></div>
</div>
<div class="amber"></div>
<div class="body">
  <div class="grid">
    <div class="card"><div class="label">Invoice details</div><table class="kv">
      ${row('Invoice no.', `<b>${esc(inv.invoiceNumber)}</b>`)}
      ${row('Invoice date', esc(issued))}
      ${row('Service period', esc(period))}
      ${row('Payment ID', esc(inv.gatewayPaymentId || '—'))}
      ${row('Order ID', esc(inv.gatewayOrderId || '—'))}
    </table><span class="paid">PAID</span></div>
    <div class="card"><div class="label">From (seller)</div><b>${esc(seller.legalName)}</b>${fromNow}<br/>${esc(seller.address)}<br/>${esc(seller.email)}${seller.pan ? `<br/>PAN ${esc(seller.pan)}` : ''}<br/><span class="muted">${seller.gstin ? `GSTIN ${esc(seller.gstin)}` : 'Not registered under GST'}</span></div>
    <div class="card"><div class="label">Billed to</div><b>${esc(inv.buyer?.name || '—')}</b><br/>${esc(inv.buyer?.orgName)}<br/>${esc(inv.buyer?.email)}</div>
  </div>
  <table class="items">
    <tr><th style="width:34px">#</th><th>Description</th><th>Service period</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr>
    <tr><td>1</td><td><b>${esc(item)}</b><br/><span class="muted">AI visibility tracking subscription</span></td><td>${esc(period)}</td><td class="r">1</td><td class="r">${esc(rupees(inv.amount))}</td><td class="r">${esc(rupees(inv.amount))}</td></tr>
  </table>
  <div class="totals">
    <div class="words"><div class="label">Amount in words</div>${esc(amountInWords(inv.amount))}</div>
    <div class="sum"><table>
      <tr><td>Subtotal</td><td class="r">${esc(rupees(inv.amount))}</td></tr>
      <tr><td>GST</td><td class="r">${seller.gstin ? '—' : 'Not applicable'}</td></tr>
      <tr class="grand"><td>Total paid</td><td class="r">${esc(rupees(inv.amount))}</td></tr>
    </table></div>
  </div>
  <div class="notes">
    <div class="label">Payment</div>
    <p>Paid via ${esc(inv.paymentMethod)}${inv.gatewayPaymentId ? `, payment ${esc(inv.gatewayPaymentId)}` : ''}, on ${esc(issued)}.</p>
    ${inv.taxNote ? `<p>${esc(inv.taxNote)}</p>` : ''}
  </div>
</div>
<div class="foot">
  <div>This is a computer-generated invoice and does not need a signature.<br/>${esc(seller.legalName)} · ${esc(seller.address)}</div>
  <div class="r">Questions? ${esc(seller.email)}<br/>geosignalai.com</div>
</div>
</div></body></html>`
}

export const invoicePdf = async (inv: IInvoice) =>
    withBrowser(async (browser) => {
        const page = await browser.newPage()
        await page.setContent(renderInvoiceHtml(inv, await getSeller()), { waitUntil: 'domcontentloaded' })
        return Buffer.from(await page.pdf({ format: 'A4', printBackground: true }))
    })

// After activation: the invoice with its PDF to the paying user
export const sendInvoiceEmail = async (
    invoiceId: string,
    deps: { pdf?: (inv: IInvoice) => Promise<Buffer>; send?: typeof emailService.sendEmail } = {}
) => {
    const inv = (await InvoiceModel.findById(invoiceId).lean()) as unknown as IInvoice | null
    if (!inv?.buyer?.email) return
    const pdf = await (deps.pdf ?? invoicePdf)(inv)
    const billing = `${(config.FRONTEND_URL || '').replace(/\/$/, '')}/billing`
    const subject = `Your Signal AI invoice ${inv.invoiceNumber}`
    const what = inv.items?.[0]?.description || 'your plan'
    const html = layout({
        preheader: `${rupees(inv.amount)} paid for your Signal AI plan.`,
        title: 'Thanks for your payment',
        intro: `We received ${esc(rupees(inv.amount))} for <b>${esc(what)}</b>${inv.period?.start ? `, ${esc(day(inv.period.start))} – ${esc(day(inv.period.end))}` : ''}. Your invoice ${esc(inv.invoiceNumber)} is attached.`,
        button: { label: 'Open billing', url: billing },
        note: inv.taxNote ? esc(inv.taxNote) : undefined
    })
    const text = `${subject}\n\nWe received ${rupees(inv.amount)} for ${what}. Invoice attached.\n\nBilling: ${billing}`
    await (deps.send ?? emailService.sendEmail)([inv.buyer.email], subject, text, {
        html,
        attachments: [{ filename: invoiceFileName(inv), content: pdf }]
    })
}
