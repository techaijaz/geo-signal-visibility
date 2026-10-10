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

// A4 invoice; "INVOICE" (never "Tax Invoice") while the seller has no GSTIN
export const renderInvoiceHtml = (inv: IInvoice, fallbackSeller: ISeller) => {
    const seller = inv.seller || fallbackSeller
    const fromNow = inv.seller ? '' : ' <span style="color:#888">(details at download time)</span>'
    const period = inv.period?.start ? `${day(inv.period.start)} – ${day(inv.period.end)}` : ''
    const item = inv.items?.[0]?.description || `Signal AI ${inv.plan} plan`
    return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:Arial,Helvetica,sans-serif;color:#0F2629;margin:40px;font-size:13px}
h1{font-size:26px;letter-spacing:.08em;margin:0}
.row{display:flex;justify-content:space-between;gap:24px;margin-top:28px}
.box{flex:1}.label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#52676A;margin-bottom:4px}
table{width:100%;border-collapse:collapse;margin-top:28px}th,td{text-align:left;padding:10px;border-bottom:1px solid #E4E9E7}
th{background:#F2F4F1;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#52676A}td.amt,th.amt{text-align:right}
.total{font-size:16px;font-weight:bold}.note{margin-top:24px;color:#33484B}
</style></head><body>
<div class="row" style="margin-top:0;align-items:flex-start"><div><h1>INVOICE</h1><div style="margin-top:6px;color:#52676A">Signal AI</div></div>
<div style="text-align:right"><div><b>${esc(inv.invoiceNumber)}</b></div><div>Date: ${esc(day(inv.paidAt || inv.createdAt))}</div></div></div>
<div class="row"><div class="box"><div class="label">From</div><b>${esc(seller.legalName)}</b>${fromNow}<br/>${esc(seller.address)}<br/>${esc(seller.email)}${seller.pan ? `<br/>PAN ${esc(seller.pan)}` : ''}${seller.gstin ? `<br/>GSTIN ${esc(seller.gstin)}` : ''}</div>
<div class="box"><div class="label">Billed to</div><b>${esc(inv.buyer?.name)}</b><br/>${esc(inv.buyer?.orgName)}<br/>${esc(inv.buyer?.email)}</div></div>
<table><tr><th>Description</th><th>Period</th><th class="amt">Amount</th></tr>
<tr><td>${esc(item)}</td><td>${esc(period)}</td><td class="amt">${esc(rupees(inv.amount))}</td></tr>
<tr><td colspan="2" class="total">Total</td><td class="amt total">${esc(rupees(inv.amount))}</td></tr></table>
<div class="note">Paid via ${esc(inv.paymentMethod)}${inv.gatewayPaymentId ? `, payment ${esc(inv.gatewayPaymentId)}` : ''}.</div>
${inv.taxNote ? `<div class="note">${esc(inv.taxNote)}</div>` : ''}
<div class="note" style="color:#52676A">Questions? ${esc(seller.email)}</div>
</body></html>`
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
