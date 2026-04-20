import logger from '@adonisjs/core/services/logger'
import nodemailer, { Transporter } from 'nodemailer'
import env from '#start/env'

export interface NotificationPayload {
  recipient: string
  subject?: string
  body: string
  channel: 'EMAIL' | 'SMS'
}

let transporter: Transporter | null = null

function getTransporter(): Transporter {
  if (transporter) return transporter
  transporter = nodemailer.createTransport({
    host: env.get('BREVO_SMTP_HOST'),
    port: env.get('BREVO_SMTP_PORT'),
    secure: false,
    auth: {
      user: env.get('BREVO_SMTP_USER'),
      pass: env.get('BREVO_SMTP_PASSWORD'),
    },
  })
  return transporter
}

/**
 * Test-only helper: lets specs inject a fake transporter (e.g. a stub that
 * records calls) without going through nodemailer. Not exported via the
 * public surface of the module documentation.
 */
export function __setTransporterForTest(t: Transporter | null): void {
  transporter = t
}

export async function sendEmail(payload: NotificationPayload): Promise<boolean> {
  const senderEmail = env.get('BREVO_SENDER_EMAIL')
  const senderName = env.get('BREVO_SENDER_NAME')

  try {
    const info = await getTransporter().sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: payload.recipient,
      subject: payload.subject ?? '(no subject)',
      text: payload.body,
      html: `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(payload.body)}</pre>`,
    })
    logger.info(
      { to: payload.recipient, subject: payload.subject, messageId: info.messageId },
      '[brevo] email sent'
    )
    return true
  } catch (err) {
    logger.error({ err, to: payload.recipient }, '[brevo] email send failed')
    return false
  }
}

/**
 * SMS via Brevo Transactional SMS REST API
 * POST https://api.brevo.com/v3/transactionalSMS/sms
 *
 * Requires BREVO_API_KEY (separate from SMTP credentials). If the key is
 * absent or the API returns ≥ 400 we log and return false so the caller can
 * record the failure in the notifications table.
 */
export async function sendSms(payload: NotificationPayload): Promise<boolean> {
  const apiKey = env.get('BREVO_API_KEY')
  const sender = env.get('BREVO_SMS_SENDER')

  if (!apiKey) {
    logger.warn({ to: payload.recipient }, '[brevo-sms] BREVO_API_KEY not set — skipping send')
    return false
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender,
        recipient: payload.recipient,
        content: payload.body,
        type: 'transactional',
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      logger.error(
        { to: payload.recipient, status: res.status, body: text },
        '[brevo-sms] send failed'
      )
      return false
    }

    const data = (await res.json().catch(() => ({}))) as { messageId?: string }
    logger.info(
      { to: payload.recipient, messageId: data.messageId },
      '[brevo-sms] SMS sent'
    )
    return true
  } catch (err) {
    logger.error({ err, to: payload.recipient }, '[brevo-sms] transport error')
    return false
  }
}

export async function dispatch(payload: NotificationPayload): Promise<boolean> {
  if (payload.channel === 'EMAIL') return sendEmail(payload)
  if (payload.channel === 'SMS') return sendSms(payload)
  logger.warn({ channel: payload.channel }, '[dispatcher] unknown channel')
  return false
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
