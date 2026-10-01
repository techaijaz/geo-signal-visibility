import nodemailer, { Transporter } from 'nodemailer'
import { Resend } from 'resend'
import config from '../config/config'
import { EApplicationEnvionment } from '../constent/application'
import loger from '../util/loger'

export interface IEmailAttachment {
    filename: string
    content: Buffer
}

export interface IEmailOptions {
    html?: string
    attachments?: IEmailAttachment[]
    headers?: Record<string, string>
}

const plainToHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')

let smtpTransport: Transporter | null = null
const getSmtp = () => {
    const smtp = config.SMTP
    if (!smtp.USER || !smtp.PASS) return null
    if (!smtpTransport) {
        smtpTransport = nodemailer.createTransport({
            host: smtp.HOST,
            port: smtp.PORT,
            // 465 = implicit TLS (Hostinger default); 587 = STARTTLS
            secure: smtp.SECURE || smtp.PORT === 465,
            auth: { user: smtp.USER, pass: smtp.PASS }
        })
    }
    return smtpTransport
}

let resendClient: Resend | null = null
const getResend = () => {
    if (!config.EMAIL.RESEND_API_KEY) return null
    if (!resendClient) resendClient = new Resend(config.EMAIL.RESEND_API_KEY)
    return resendClient
}

const fromAddress = () => config.EMAIL.FROM || (config.SMTP.USER ? `"Signal AI" <${config.SMTP.USER}>` : '')

export default {
    /**
     * Send an email through the provider chosen by EMAIL_PROVIDER ('smtp' or 'resend').
     * Throws when the configured provider rejects the message, so callers (and job retries) can react.
     * With no provider configured, prints the email to the console for local development.
     */
    sendEmail: async (to: string[], subject: string, text: string, options: IEmailOptions = {}) => {
        const html = options.html || plainToHtml(text)
        const from = fromAddress()

        if (config.EMAIL.PROVIDER === 'resend') {
            const resend = getResend()
            if (resend) {
                const result = await resend.emails.send({
                    from,
                    to,
                    subject,
                    text,
                    html,
                    headers: options.headers,
                    attachments: options.attachments?.map((a) => ({ filename: a.filename, content: a.content }))
                })
                if (result.error) {
                    loger.error('EMAIL_SERVICE: Resend API error', { meta: { error: JSON.stringify(result.error) } })
                    throw new Error(`Resend: ${result.error.message}`)
                }
                loger.info('EMAIL_SERVICE: Sent via Resend', { meta: { id: result.data?.id, to } })
                return result
            }
        } else {
            const smtp = getSmtp()
            if (smtp) {
                const info = await smtp.sendMail({
                    from,
                    to: to.join(','),
                    subject,
                    text,
                    html,
                    headers: options.headers,
                    attachments: options.attachments
                })
                loger.info('EMAIL_SERVICE: Sent via SMTP', { meta: { messageId: info.messageId, to } })
                return info
            }
        }

        // No provider configured. In production the email body can hold reset links and tokens,
        // so it must never end up in the container logs
        if (config.ENV === EApplicationEnvionment.PRODUCTION) {
            loger.error('EMAIL_SERVICE: Email not sent, no provider credentials configured', { meta: { to, subject } })
            return { status: 'not_sent' }
        }

        // Local development: print the email to the terminal instead of sending it
        /* eslint-disable no-console */
        console.log('\n==================================================')
        console.log(`📧 [EMAIL NOT SENT: no ${config.EMAIL.PROVIDER} credentials configured]`)
        console.log(`TO: ${to.join(', ')}`)
        console.log(`SUBJECT: ${subject}`)
        console.log(`CONTENT:\n${text}`)
        if (options.attachments?.length)
            console.log(`ATTACHMENTS: ${options.attachments.map((a) => `${a.filename} (${a.content.length} bytes)`).join(', ')}`)
        console.log('==================================================\n')
        /* eslint-enable no-console */
        loger.info('EMAIL_SERVICE: Mock email dispatch', { meta: { to, subject } })
        return { status: 'mocked' }
    }
}
