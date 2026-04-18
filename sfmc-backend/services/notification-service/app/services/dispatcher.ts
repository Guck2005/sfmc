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
 * Brevo SMTP relay does not support SMS. SMS routing goes through Brevo's REST
 * Transactional SMS API (`https://api.brevo.com/v3/transactionalSMS/sms`),
 * which uses an API key — separate from the SMTP key. Kept as a log-only stub
 * until that integration is wired.
 */
export async function sendSms(payload: NotificationPayload): Promise<boolean> {
  logger.info(
    { to: payload.recipient, body: payload.body },
    '[brevo] SMS stub (Brevo REST API not wired yet)'
  )
  return true
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
