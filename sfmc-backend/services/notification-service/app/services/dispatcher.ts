import logger from '@adonisjs/core/services/logger'

/**
 * Notification Dispatcher — Stub implementation
 *
 * In production, this would integrate with:
 * - Brevo (Sendinblue) for Email via their REST API
 * - Brevo SMS API for SMS
 *
 * Environment variables (to be configured in Sprint 4):
 * - BREVO_API_KEY: API key for Brevo
 * - BREVO_SENDER_EMAIL: sender email address
 * - BREVO_SMS_SENDER: SMS sender name
 */

export interface NotificationPayload {
  recipient: string
  subject?: string
  body: string
  channel: 'EMAIL' | 'SMS'
}

/**
 * Stub: Send an email notification
 * In production → POST https://api.brevo.com/v3/smtp/email
 */
export async function sendEmail(payload: NotificationPayload): Promise<boolean> {
  logger.info(
    {
      to: payload.recipient,
      subject: payload.subject,
      channel: 'EMAIL',
    },
    '📧 [STUB-BREVO-EMAIL] Notification envoyée'
  )
  console.info('═══════════════════════════════════════════════════')
  console.info('📧 EMAIL NOTIFICATION (Stub Brevo)')
  console.info(`   TO:      ${payload.recipient}`)
  console.info(`   SUBJECT: ${payload.subject}`)
  console.info(`   BODY:    ${payload.body}`)
  console.info('═══════════════════════════════════════════════════')
  return true
}

/**
 * Stub: Send an SMS notification
 * In production → POST https://api.brevo.com/v3/transactionalSMS/sms
 */
export async function sendSms(payload: NotificationPayload): Promise<boolean> {
  logger.info(
    {
      to: payload.recipient,
      channel: 'SMS',
    },
    '📱 [STUB-BREVO-SMS] SMS envoyé'
  )
  console.info('═══════════════════════════════════════════════════')
  console.info('📱 SMS NOTIFICATION (Stub Brevo)')
  console.info(`   TO:   ${payload.recipient}`)
  console.info(`   BODY: ${payload.body}`)
  console.info('═══════════════════════════════════════════════════')
  return true
}

/**
 * Dispatch a notification through the appropriate channel
 */
export async function dispatch(payload: NotificationPayload): Promise<boolean> {
  if (payload.channel === 'EMAIL') {
    return sendEmail(payload)
  } else if (payload.channel === 'SMS') {
    return sendSms(payload)
  }
  logger.warn({ channel: payload.channel }, '[dispatcher] unknown channel')
  return false
}
