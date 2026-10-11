import crypto from 'crypto'
import { Request, Response } from 'express'
import config from '../../config/config'
import { activatePayment, orderInfoFromRazorpay } from './activatePayment'
import { PaymentError } from './prices'
import { getRazorpay } from '../paymentService'
import logger from '../../util/loger'
import { sendInvoiceEmail } from './invoiceDoc'

// Razorpay signs the exact bytes it sends
export const validWebhookSignature = (raw: Buffer, signature: string | undefined, secret: string) => {
    if (!signature || !secret) return false
    const expected = Buffer.from(crypto.createHmac('sha256', secret).update(raw).digest('hex'))
    const given = Buffer.from(signature)
    return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}

interface IWebhookDeps {
    secret?: string
    fetchOrder?: (id: string) => Promise<{ id: string; amount: number | string; notes?: Record<string, unknown> }>
    activate?: typeof activatePayment
}

// payment.captured → the same activation as the browser confirm; anything else is acknowledged and ignored
export const handleRazorpayWebhook = async (raw: Buffer, signature: string | undefined, deps: IWebhookDeps = {}) => {
    const secret = deps.secret ?? config.PAYMENT.RAZORPAY_WEBHOOK_SECRET
    if (!secret) {
        logger.warn('[billing] Razorpay webhook called but RAZORPAY_WEBHOOK_SECRET is not set')
        return { status: 503, body: 'webhook not configured' }
    }
    if (!Buffer.isBuffer(raw) || !validWebhookSignature(raw, signature, secret)) return { status: 400, body: 'bad signature' }

    let event: { event?: string; payload?: { payment?: { entity?: { id: string; order_id: string; method?: string } } } }
    try {
        event = JSON.parse(raw.toString('utf8'))
    } catch {
        return { status: 400, body: 'bad body' }
    }
    const payment = event.payload?.payment?.entity
    if (event.event !== 'payment.captured' || !payment?.id || !payment.order_id) return { status: 200, body: 'ignored' }
    try {
        const fetchOrder =
            deps.fetchOrder ?? ((id: string) => getRazorpay().orders.fetch(id) as unknown as ReturnType<NonNullable<IWebhookDeps['fetchOrder']>>)
        const order = orderInfoFromRazorpay(await fetchOrder(payment.order_id))
        await (deps.activate ?? activatePayment)(
            {
                paymentId: payment.id,
                orderId: payment.order_id,
                order,
                gateway: 'razorpay',
                paymentMethod: payment.method === 'upi' ? 'UPI (Razorpay)' : 'Card (Razorpay)',
                source: 'webhook'
            },
            // Razorpay waits ~5 s; a claim still running elsewhere answers 500 and is retried
            { sendInvoice: sendInvoiceEmail, waitMs: 3000 }
        )
    } catch (err) {
        // A bad order never gets better: acknowledge it. Anything else (DB, network, a claim still
        // in progress): 500, so Razorpay retries for ~24 h and a later try finishes or takes over
        logger.error(`[billing] Webhook activation for ${payment.id} failed`, { meta: err })
        if (err instanceof PaymentError) return { status: 200, body: 'refused' }
        return { status: 500, body: 'retry' }
    }
    return { status: 200, body: 'ok' }
}

export const razorpayWebhookRoute = async (req: Request, res: Response) => {
    const out = await handleRazorpayWebhook(req.body as Buffer, req.header('x-razorpay-signature') || undefined)
    res.status(out.status).send(out.body)
}
