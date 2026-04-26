import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { paymentWebhookSecret } from '#services/mobile_money_config'
import { verifyPaymentWebhookSignature } from '#services/payment_webhook_signing'
import {
  finalizeMobileMoneyAfterProviderConfirmation,
  OrderMobileMoneyStateError,
} from '#services/order_service'

const webhookBodyValidator = vine.compile(
  vine.object({
    orderId: vine.string().uuid(),
    event: vine.string(),
    providerReference: vine.string().trim().minLength(1).maxLength(128),
  })
)

/**
 * Webhook public (pas de JWT) : le PSP confirme l’encaissement avec HMAC (PAYMENT_WEBHOOK_SECRET).
 * POST /api/v1/webhooks/mobile-money
 */
export default class PaymentWebhookController {
  async handleMobileMoney(ctx: HttpContext) {
    const { request, response } = ctx
    const secret = paymentWebhookSecret()
    if (!secret) {
      return response.serviceUnavailable({
        error: {
          code: 'WEBHOOK_MISCONFIGURED',
          message: 'PAYMENT_WEBHOOK_SECRET n’est pas configuré sur order-service.',
        },
      })
    }

    const sigRaw = request.header('x-payment-signature') ?? request.header('X-Payment-Signature')
    if (!sigRaw) {
      return response.unauthorized({
        error: { code: 'MISSING_SIGNATURE', message: 'En-tête X-Payment-Signature requis (hex HMAC-SHA256).' },
      })
    }

    const body = await request.validateUsing(webhookBodyValidator)
    if (body.event !== 'payment.succeeded') {
      return response.unprocessableEntity({
        error: { code: 'UNSUPPORTED_EVENT', message: `Événement non pris en charge : ${body.event}` },
      })
    }

    if (!verifyPaymentWebhookSignature(secret, body.orderId, body.event, body.providerReference, sigRaw.trim())) {
      return response.unauthorized({
        error: { code: 'INVALID_SIGNATURE', message: 'Signature HMAC invalide.' },
      })
    }

    try {
      const order = await finalizeMobileMoneyAfterProviderConfirmation(
        body.orderId,
        body.providerReference
      )
      return response.ok({
        data: { orderId: order.id, status: order.status, orderNumber: order.orderNumber },
      })
    } catch (err) {
      if (err instanceof OrderMobileMoneyStateError) {
        return response.unprocessableEntity({
          error: { code: err.code, message: err.message },
        })
      }
      throw err
    }
  }
}
