import nodemailer from 'nodemailer'
import { Resend } from 'resend'
import config from '../config/config'
import loger from '../util/loger'

const resend = config.EMAIL_SERVICE_API_KEY ? new Resend(config.EMAIL_SERVICE_API_KEY) : null

export default {
    sendEmail: async (to: string[], subject: string, text: string) => {
        // 1. Try Nodemailer SMTP if configured
        if (config.SMTP.USER && config.SMTP.PASS) {
            try {
                const transporter = nodemailer.createTransport({
                    service: config.SMTP.HOST === 'smtp.gmail.com' ? 'gmail' : undefined,
                    host: config.SMTP.HOST,
                    port: config.SMTP.PORT,
                    secure: config.SMTP.SECURE,
                    auth: {
                        user: config.SMTP.USER,
                        pass: config.SMTP.PASS
                    },
                    tls: {
                        rejectUnauthorized: false
                    }
                })

                const info = await transporter.sendMail({
                    from: config.SMTP.FROM || `"Signal" <${config.SMTP.USER}>`,
                    to: to.join(','),
                    subject,
                    text,
                    html: text.replace(/\n/g, '<br/>')
                })
                loger.info('EMAIL_SERVICE: Sent via SMTP Nodemailer', { meta: { messageId: info.messageId } })
                return info
            } catch (smtpError: any) {
                console.error('❌ [NODEMAILER SMTP ERROR]:', smtpError)
                loger.error('EMAIL_SERVICE: SMTP Nodemailer failed', { meta: { error: smtpError?.message || String(smtpError) } })
            }
        }

        // 2. Fallback to Resend API
        if (resend) {
            try {
                const result = await resend.emails.send({
                    from: 'onboarding@resend.dev',
                    to,
                    subject,
                    html: text
                })
                if (result.error) {
                    console.error('❌ [RESEND API ERROR]:', result.error)
                    loger.error('EMAIL_SERVICE: Resend API error', { meta: { error: JSON.stringify(result.error) } })
                } else {
                    loger.info('EMAIL_SERVICE: Sent via Resend API', { meta: { result } })
                    return result
                }
            } catch (resendError: any) {
                console.error('❌ [RESEND API EXCEPTION]:', resendError)
                loger.error('EMAIL_SERVICE: Resend API failed', { meta: { error: resendError?.message || String(resendError) } })
            }
        }

        // 3. Fallback mock email for local dev (prints confirmation link to backend terminal)
        console.log('\n==================================================')
        console.log('📧 [MOCK EMAIL DISPATCH - LOCAL DEV]')
        console.log(`TO: ${to.join(', ')}`)
        console.log(`SUBJECT: ${subject}`)
        console.log(`CONTENT:\n${text}`)
        console.log('==================================================\n')
        loger.info('EMAIL_SERVICE: Mock email dispatch', { to, subject, text })
        return { status: 'mocked' }
    }
}
