// Account emails (sign-up confirmation, password reset...). Each returns the subject, a plain-text
// version and an HTML version in the Signal AI look (same colours as the weekly report email).
// Email clients only render inline styles and tables, so the HTML is written that way.

const SUPPORT_EMAIL = 'support@geosignalai.com'

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const firstName = (name: string) => (name || '').trim().split(/\s+/)[0] || 'there'

export interface IAccountEmail {
    subject: string
    text: string
    html: string
}

interface ILayout {
    preheader: string
    title: string
    intro: string
    button?: { label: string; url: string }
    // Shown under the button, for when the button doesn't work
    linkNote?: string
    steps?: { title: string; body: string }[]
    note?: string
}

const layout = (l: ILayout) => {
    const steps = l.steps?.length
        ? `<tr><td style="padding:26px 0 6px;font-size:13px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;color:#52676A">What happens next</td></tr>
  ${l.steps
      .map(
          (s, i) => `<tr><td style="padding:8px 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td valign="top" style="width:30px"><div style="width:24px;height:24px;line-height:24px;border-radius:12px;background:#FFF4D6;color:#0F2629;font-size:12px;font-weight:bold;text-align:center">${i + 1}</div></td>
    <td valign="top" style="font-size:14px;line-height:1.5;color:#0F2629"><b>${esc(s.title)}</b><br/><span style="color:#52676A">${esc(s.body)}</span></td>
  </tr></table></td></tr>`
      )
      .join('')}`
        : ''

    const button = l.button
        ? `<tr><td style="padding:24px 0 8px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:#FFC857">
    <a href="${esc(l.button.url)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:bold;color:#0F2629;text-decoration:none;border-radius:8px">${esc(l.button.label)}</a>
  </td></tr></table></td></tr>
  <tr><td style="font-size:12px;line-height:1.5;color:#52676A">${esc(l.linkNote || 'Button not working? Paste this link into your browser:')}<br/>
    <a href="${esc(l.button.url)}" style="color:#1F6F78;word-break:break-all">${esc(l.button.url)}</a></td></tr>`
        : ''

    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(l.title)}</title></head>
<body style="margin:0;padding:0;background:#F2F4F1;font-family:Arial,Helvetica,sans-serif;color:#0F2629">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(l.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F1;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
  <tr><td style="padding:0 4px 14px;font-size:15px;font-weight:bold;color:#0F2629"><span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:#FFC857;margin-right:8px"></span>Signal AI</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #D3DBD8;border-radius:14px">
  <tr><td style="height:5px;background:#FFC857;border-radius:14px 14px 0 0;font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td style="padding:30px 32px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="font-size:24px;font-weight:bold;line-height:1.25;color:#0F2629">${esc(l.title)}</td></tr>
  <tr><td style="padding-top:12px;font-size:15px;line-height:1.6;color:#33484B">${l.intro}</td></tr>
  ${button}
  ${steps}
  ${l.note ? `<tr><td style="padding-top:24px;font-size:13px;line-height:1.5;color:#52676A;border-top:1px solid #E4E9E7">${l.note}</td></tr>` : ''}
  </table></td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
  <tr><td style="padding:18px 4px 0;font-size:12px;line-height:1.6;color:#52676A">Signal AI shows how often ChatGPT, Gemini, Claude and other AI assistants recommend your brand.<br/>
  Questions? Write to <a href="mailto:${SUPPORT_EMAIL}" style="color:#52676A">${SUPPORT_EMAIL}</a>.</td></tr>
</table>
</td></tr></table></body></html>`
}

const text = (lines: (string | false | undefined)[]) =>
    [...lines.filter((l) => l !== false && l !== undefined), '', '— Signal AI', `Questions? ${SUPPORT_EMAIL}`].join('\n')

const notYou = 'If you didn’t ask for this, you can ignore this email. Nothing changes on your account.'

export default {
    confirmAccount: (name: string, url: string): IAccountEmail => ({
        subject: 'Confirm your email to start with Signal AI',
        text: text([
            `Hi ${firstName(name)},`,
            '',
            'Welcome to Signal AI. Confirm your email to finish setting up your account:',
            url,
            '',
            'What happens next:',
            '1. Add your brand: your website, category and the competitors you want to watch.',
            '2. We ask the AI assistants: ChatGPT, Gemini, Claude and more answer the questions your buyers ask.',
            '3. See your score: how often you are recommended, next to your competitors, with what to fix.',
            '',
            `If you didn't create a Signal AI account, ignore this email.`
        ]),
        html: layout({
            preheader: 'One click and your account is ready. Then add your brand and run your first AI visibility scan.',
            title: 'Confirm your email',
            intro: `Hi ${esc(firstName(name))}, welcome to Signal AI. Confirm your email address to finish setting up your account.`,
            button: { label: 'Confirm my email', url },
            steps: [
                { title: 'Add your brand', body: 'Your website, category and the competitors you want to watch.' },
                { title: 'We ask the AI assistants', body: 'ChatGPT, Gemini, Claude and more answer the questions your buyers ask.' },
                { title: 'See your score', body: 'How often you are recommended, next to your competitors, and what to fix.' }
            ],
            note: `If you didn’t create a Signal AI account, you can ignore this email.`
        })
    }),

    accountConfirmed: (name: string, appUrl: string): IAccountEmail => ({
        subject: 'Your Signal AI account is ready',
        text: text([`Hi ${firstName(name)},`, '', 'Your email is confirmed. Log in and add your brand to run your first scan:', appUrl]),
        html: layout({
            preheader: 'Your email is confirmed. Add your brand and run your first scan.',
            title: 'You’re all set',
            intro: `Hi ${esc(firstName(name))}, your email is confirmed. Log in and add your brand to see how AI assistants talk about it.`,
            button: { label: 'Open Signal AI', url: appUrl }
        })
    }),

    passwordReset: (name: string, url: string): IAccountEmail => ({
        subject: 'Reset your Signal AI password',
        text: text([
            `Hi ${firstName(name)},`,
            '',
            'Someone asked to reset the password of your Signal AI account. Choose a new one here (the link works for 15 minutes):',
            url,
            '',
            notYou
        ]),
        html: layout({
            preheader: 'Choose a new password. The link works for 15 minutes.',
            title: 'Reset your password',
            intro: `Hi ${esc(firstName(name))}, someone asked to reset the password of your Signal AI account. Choose a new one with the button below. The link works for <b>15 minutes</b>.`,
            button: { label: 'Choose a new password', url },
            note: esc(notYou)
        })
    }),

    passwordResetDone: (name: string, appUrl: string): IAccountEmail => ({
        subject: 'Your Signal AI password was reset',
        text: text([
            `Hi ${firstName(name)},`,
            '',
            'Your password was reset. You can log in with the new one:',
            appUrl,
            '',
            `If this wasn't you, reset it again right away and write to ${SUPPORT_EMAIL}.`
        ]),
        html: layout({
            preheader: 'Your password was reset.',
            title: 'Password reset',
            intro: `Hi ${esc(firstName(name))}, your password was reset. You can log in with the new one.`,
            button: { label: 'Log in', url: appUrl },
            note: `If this wasn’t you, reset your password again right away and write to <a href="mailto:${SUPPORT_EMAIL}" style="color:#52676A">${SUPPORT_EMAIL}</a>.`
        })
    }),

    passwordChanged: (name: string, appUrl: string): IAccountEmail => ({
        subject: 'Your Signal AI password was changed',
        text: text([
            `Hi ${firstName(name)},`,
            '',
            'The password of your Signal AI account was just changed from your account settings.',
            '',
            `If this wasn't you, reset your password from the login page and write to ${SUPPORT_EMAIL}.`,
            appUrl
        ]),
        html: layout({
            preheader: 'The password of your account was just changed.',
            title: 'Password changed',
            intro: `Hi ${esc(firstName(name))}, the password of your Signal AI account was just changed from your account settings.`,
            button: { label: 'Open Signal AI', url: appUrl },
            note: `If this wasn’t you, reset your password from the login page and write to <a href="mailto:${SUPPORT_EMAIL}" style="color:#52676A">${SUPPORT_EMAIL}</a>.`
        })
    })
}
