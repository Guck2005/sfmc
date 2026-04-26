import { createHmac, timingSafeEqual } from 'node:crypto'

const SEP = '\n'

/** Corps signé côté PSP / webhook : orderId, event, providerReference (une ligne chacun). */
export function paymentWebhookPayloadString(
  orderId: string,
  event: string,
  providerReference: string
): string {
  return `${orderId}${SEP}${event}${SEP}${providerReference}`
}

export function signPaymentWebhookPayload(secret: string, orderId: string, event: string, providerReference: string): string {
  return createHmac('sha256', secret).update(paymentWebhookPayloadString(orderId, event, providerReference)).digest('hex')
}

export function verifyPaymentWebhookSignature(
  secret: string,
  orderId: string,
  event: string,
  providerReference: string,
  signatureHex: string
): boolean {
  const expected = signPaymentWebhookPayload(secret, orderId, event, providerReference)
  if (expected.length !== signatureHex.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signatureHex, 'hex'))
  } catch {
    return false
  }
}
