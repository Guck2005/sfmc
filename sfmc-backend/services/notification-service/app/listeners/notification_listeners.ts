import Notification from '#models/notification'
import ProcessedEvent from '#models/processed_event'
import { dispatch } from '#services/dispatcher'
import logger from '@adonisjs/core/services/logger'

// Admin email/phone for internal alerts
const ADMIN_EMAIL = 'davidyd07@gmail.com'
const ADMIN_PHONE = '+22990000000'

/**
 * Helper: check idempotency and create notification record
 */
async function processNotification(
  event: any,
  recipient: string,
  type: string,
  channel: 'EMAIL' | 'SMS',
  subject: string,
  body: string
) {
  // Idempotency check
  const alreadyProcessed = await ProcessedEvent.find(event.id)
  if (alreadyProcessed) {
    logger.info({ eventId: event.id }, '[notification] event already processed, skipping')
    return
  }

  const success = await dispatch({ recipient, subject, body, channel })

  await Notification.create({
    recipient,
    type,
    channel,
    status: success ? 'SENT' : 'FAILED',
    payload: JSON.stringify(event.payload),
  })

  await ProcessedEvent.create({ eventId: event.id, eventType: event.type })
}

/**
 * order.validated → Email au client
 */
export async function onOrderValidated(event: any) {
  logger.info({ eventId: event.id }, '[notification] received order.validated')
  const payload = event.payload
  const customerEmail = payload.customerEmail || ADMIN_EMAIL

  await processNotification(
    event,
    customerEmail,
    'ORDER_VALIDATED',
    'EMAIL',
    `Commande ${payload.orderId} validée`,
    `Votre commande n°${payload.orderId} a été validée avec succès. Montant: ${payload.totalAmount} ${payload.currency || 'XOF'}.`
  )
}

/**
 * order.shipped → SMS au client
 */
export async function onOrderShipped(event: any) {
  logger.info({ eventId: event.id }, '[notification] received order.shipped')
  const payload = event.payload
  const customerPhone = payload.customerPhone || ADMIN_PHONE

  await processNotification(
    event,
    customerPhone,
    'ORDER_SHIPPED',
    'SMS',
    'Expédition commande',
    `SFMC: Votre commande ${payload.orderId} est en cours de livraison.`
  )
}

/**
 * production.quality_failed → Email alerte admin production
 */
export async function onProductionQualityFailed(event: any) {
  logger.info({ eventId: event.id }, '[notification] received production.quality_failed')
  const payload = event.payload

  await processNotification(
    event,
    ADMIN_EMAIL,
    'QUALITY_FAILED',
    'EMAIL',
    `⚠️ Échec qualité — Produit ${payload.productId}`,
    `Alerte qualité: Le produit ${payload.productId} (commande ${payload.orderId}, qté: ${payload.quantity}) a échoué au contrôle qualité. Raison: ${payload.reason || 'Non spécifiée'}.`
  )
}

/**
 * inventory.critical_stock → Email alerte admin achats
 */
export async function onInventoryCriticalStock(event: any) {
  logger.info({ eventId: event.id }, '[notification] received inventory.critical_stock')
  const payload = event.payload

  await processNotification(
    event,
    ADMIN_EMAIL,
    'CRITICAL_STOCK',
    'EMAIL',
    `🔴 Alerte stock critique — ${payload.productId}`,
    `Le stock du produit ${payload.productId} est critique: ${payload.currentQuantity} unités restantes (seuil: ${payload.threshold}).`
  )
}

/**
 * order.cancelled → Email au client et/ou Admin
 */
export async function onOrderCancelled(event: any) {
  logger.info({ eventId: event.id }, '[notification] received order.cancelled')
  const payload = event.payload
  const customerEmail = payload.customerEmail || ADMIN_EMAIL

  await processNotification(
    event,
    customerEmail,
    'ORDER_CANCELLED',
    'EMAIL',
    `Commande ${payload.orderId} annulée`,
    `Votre commande n°${payload.orderId} a été annulée. Raison: ${payload.reason || 'Manuel'}.`
  )
}
