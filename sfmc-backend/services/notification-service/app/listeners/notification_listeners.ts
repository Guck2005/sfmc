import Notification from '#models/notification'
import ProcessedEvent from '#models/processed_event'
import {
  fetchCreditNotePdfBuffer,
  fetchInvoicePdfBuffer,
  safeCreditNotePdfFilename,
  safeInvoicePdfFilename,
} from '#services/billing_pdf_client'
import { dispatch } from '#services/dispatcher'
import type { EmailAttachment } from '#services/dispatcher'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'

const FALLBACK_EMAIL = 'davidyd07@gmail.com'

function adminEmail(): string {
  return env.get('ADMIN_FALLBACK_EMAIL') || FALLBACK_EMAIL
}

function logisticsEmail(): string {
  return env.get('LOGISTICS_EMAIL') || adminEmail()
}

function productionEmail(): string {
  return env.get('PRODUCTION_EMAIL') || adminEmail()
}

function financeEmail(): string {
  return env.get('FINANCE_EMAIL') || adminEmail()
}

function uniqueRecipients(list: Array<string | undefined | null>): string[] {
  const set = new Set<string>()
  for (const r of list) {
    if (r && r.includes('@')) set.add(r.trim().toLowerCase())
  }
  return Array.from(set)
}

/**
 * Send an Email to one or multiple recipients and record a notification row
 * per recipient. Idempotent at the event level: if the event was already
 * processed we skip the whole thing.
 *
 * Note — per BF 6 the project runs Email-only. `dispatcher.sendSms` is kept
 * intentionally in place but no listener calls it anymore.
 */
async function sendEmailNotification(
  event: any,
  recipients: string[],
  type: string,
  subject: string,
  body: string,
  attachments?: EmailAttachment[]
): Promise<void> {
  const alreadyProcessed = await ProcessedEvent.find(event.id)
  if (alreadyProcessed) {
    logger.info({ eventId: event.id }, '[notification] event already processed, skipping')
    return
  }

  const targets = recipients.length === 0 ? [adminEmail()] : recipients
  for (const recipient of targets) {
    const success = await dispatch({
      recipient,
      subject,
      body,
      channel: 'EMAIL',
      ...(attachments?.length ? { attachments } : {}),
    })
    await Notification.create({
      recipient,
      type,
      channel: 'EMAIL',
      status: success ? 'SENT' : 'FAILED',
      payload: JSON.stringify(event.payload),
    })
  }

  await ProcessedEvent.create({ eventId: event.id, eventType: event.type })
}

// ---------------------------------------------------------------------------
// Client-facing events (Email only)
// ---------------------------------------------------------------------------

export async function onOrderValidated(event: any) {
  logger.info({ eventId: event.id }, '[notification] received order.validated')
  const payload = event.payload
  const recipients = uniqueRecipients([payload.customerEmail])

  const orderRef = payload.orderNumber ?? payload.orderId
  await sendEmailNotification(
    event,
    recipients,
    'ORDER_VALIDATED',
    `Commande ${orderRef} validée`,
    `Bonjour,\n\nVotre commande n°${orderRef} a été validée avec succès.\nMontant total : ${payload.totalAmount} ${payload.currency || 'XOF'}.\n\nMerci de votre confiance.\nSFMC Bénin`
  )
}

export async function onOrderShipped(event: any) {
  logger.info({ eventId: event.id }, '[notification] received order.shipped')
  const payload = event.payload
  const recipients = uniqueRecipients([payload.customerEmail])

  const orderRef = payload.orderNumber ?? payload.orderId
  await sendEmailNotification(
    event,
    recipients,
    'ORDER_SHIPPED',
    `Commande ${orderRef} expédiée`,
    `Bonjour,\n\nVotre commande n°${orderRef} est en cours de livraison.\nDate d'expédition : ${payload.shippedAt ?? new Date().toISOString()}.\n\nVous recevrez une nouvelle notification dès la livraison.\nSFMC Bénin`
  )
}

export async function onOrderDelivered(event: any) {
  logger.info({ eventId: event.id }, '[notification] received order.delivered')
  const payload = event.payload
  const recipients = uniqueRecipients([payload.customerEmail])

  const orderRef = payload.orderNumber ?? payload.orderId
  await sendEmailNotification(
    event,
    recipients,
    'ORDER_DELIVERED',
    `Commande ${orderRef} livrée`,
    `Bonjour,\n\nVotre commande n°${orderRef} a été livrée avec succès.\nDate : ${payload.deliveredAt ?? new Date().toISOString()}.\n\nNous vous remercions pour votre confiance.\nSFMC Bénin`
  )
}

export async function onOrderCancelled(event: any) {
  logger.info({ eventId: event.id }, '[notification] received order.cancelled')
  const payload = event.payload
  const recipients = uniqueRecipients([payload.customerEmail])
  const orderRef = payload.orderNumber ?? payload.orderId

  await sendEmailNotification(
    event,
    recipients,
    'ORDER_CANCELLED',
    `Commande ${orderRef} annulée`,
    `Bonjour,\n\nVotre commande n°${orderRef} a été annulée.\nRaison : ${payload.reason || 'Non spécifiée'}.\n\nPour toute question, contactez notre support.\nSFMC Bénin`
  )
}

// ---------------------------------------------------------------------------
// Internal operational events (Email only, multi-recipient)
// ---------------------------------------------------------------------------

export async function onInventoryPendingReception(event: any) {
  logger.info({ eventId: event.id }, '[notification] received inventory.pending_reception')
  const payload = event.payload ?? {}
  const recipients = uniqueRecipients([logisticsEmail()])

  await sendEmailNotification(
    event,
    recipients,
    'PENDING_STOCK_RECEPTION',
    `Réception stock à valider — ${payload.quantity ?? '?'} unité(s)`,
    `Une production terminée attend d’être rangée au stock produit fini.\n\n` +
      `Réf. réception : ${payload.pendingEntryId ?? '—'}\n` +
      `Ordre de fabrication : ${payload.productionOrderId ?? '—'}\n` +
      `Produit (id catalogue) : ${payload.productId ?? '—'}\n` +
      `Quantité : ${payload.quantity ?? '—'}\n\n` +
      `Action requise : dans l’application SFMC, menu Stocks → Réceptions en attente, choisir l’entrepôt de destination et confirmer.`
  )
}

export async function onProductionQualityFailed(event: any) {
  logger.info({ eventId: event.id }, '[notification] received production.quality_failed')
  const payload = event.payload
  const recipients = uniqueRecipients([productionEmail()])

  await sendEmailNotification(
    event,
    recipients,
    'QUALITY_FAILED',
    `[ALERTE] Échec contrôle qualité — ${payload.productId}`,
    `Alerte qualité :\n\nLe produit ${payload.productId} (OF ${payload.productionOrderId ?? '?'}, quantité ${payload.quantity ?? '?'}) a échoué au contrôle qualité.\nRaison : ${payload.reason || 'Non spécifiée'}.\n\nMerci de lancer une analyse immédiate.`
  )
}

export async function onInventoryCritical(event: any) {
  logger.info({ eventId: event.id }, '[notification] received inventory.critical')
  const payload = event.payload
  const recipients = uniqueRecipients([logisticsEmail(), productionEmail()])

  await sendEmailNotification(
    event,
    recipients,
    'CRITICAL_STOCK',
    `[ALERTE] Stock critique — ${payload.productId}`,
    `Stock critique détecté :\n\nProduit : ${payload.productId}\nEntrepôt : ${payload.warehouseId}\nDisponible : ${payload.available}\nSeuil : ${payload.threshold}\n\nMerci de planifier un réapprovisionnement ou un ordre de fabrication.`
  )
}

export async function onBillingInvoiceCreated(event: any) {
  logger.info({ eventId: event.id }, '[notification] received billing.invoice_created')
  const payload = event.payload
  const recipients = uniqueRecipients([payload.customerEmail, financeEmail()])

  const invRef = payload.invoiceNumber ?? payload.invoiceId
  const ordRef = payload.orderNumber ?? payload.orderId
  const pdfBuf = await fetchInvoicePdfBuffer(payload.invoiceId)
  const attachments: EmailAttachment[] | undefined =
    pdfBuf != null
      ? [
          {
            filename: safeInvoicePdfFilename(payload.invoiceNumber, payload.invoiceId),
            content: pdfBuf,
          },
        ]
      : undefined

  await sendEmailNotification(
    event,
    recipients,
    'INVOICE_CREATED',
    `Facture ${invRef} générée`,
    `Une facture a été générée :\n\nFacture : ${invRef}\nCommande : ${ordRef}\nMontant : ${payload.amount} ${payload.currency ?? 'XOF'}\n\n` +
      (attachments
        ? 'Vous trouverez la facture en pièce jointe (PDF). Vous pouvez aussi la consulter depuis votre espace client.\n'
        : 'Vous pouvez la consulter ou la télécharger depuis votre espace client.\n') +
      'SFMC Bénin',
    attachments
  )
}

export async function onBillingInvoicePaid(event: any) {
  logger.info({ eventId: event.id }, '[notification] received billing.invoice_paid')
  const payload = event.payload
  const recipients = uniqueRecipients([payload.customerEmail, financeEmail()])

  const invRef = payload.invoiceNumber ?? payload.invoiceId
  const ordRef = payload.orderNumber ?? payload.orderId
  const pdfBuf = await fetchInvoicePdfBuffer(payload.invoiceId)
  const attachments: EmailAttachment[] | undefined =
    pdfBuf != null
      ? [
          {
            filename: safeInvoicePdfFilename(payload.invoiceNumber, payload.invoiceId),
            content: pdfBuf,
          },
        ]
      : undefined

  await sendEmailNotification(
    event,
    recipients,
    'INVOICE_PAID',
    `Facture ${invRef} acquittée`,
    `Bonjour,\n\nVotre facture ${invRef} (commande ${ordRef}) est enregistrée comme entièrement payée.\nMontant : ${payload.amount} ${payload.currency ?? 'XOF'}.\n\n` +
      (attachments
        ? 'La facture actualisée est jointe en PDF.\n'
        : 'Vous pouvez télécharger la facture depuis votre espace client.\n') +
      '\nSFMC Bénin',
    attachments
  )
}

export async function onBillingCreditNoteCreated(event: any) {
  logger.info({ eventId: event.id }, '[notification] received billing.credit_note_created')
  const payload = event.payload
  const recipients = uniqueRecipients([payload.customerEmail, financeEmail()])

  const invRef = payload.invoiceNumber ?? payload.invoiceId
  const ordRef = payload.orderNumber ?? payload.orderId
  const pdfBuf = await fetchCreditNotePdfBuffer(payload.invoiceId)
  const attachments: EmailAttachment[] | undefined =
    pdfBuf != null
      ? [
          {
            filename: safeCreditNotePdfFilename(payload.creditNoteId),
            content: pdfBuf,
          },
        ]
      : undefined

  await sendEmailNotification(
    event,
    recipients,
    'CREDIT_NOTE_CREATED',
    `Avoir — facture ${invRef}`,
    `Bonjour,\n\nSuite à l’annulation de la commande ${ordRef}, un avoir a été émis pour la facture ${invRef}.\nMontant : ${payload.amount} ${payload.currency ?? 'XOF'}.\n` +
      `Motif : ${payload.reason ?? 'Annulation commande après paiement'}.\n\n` +
      (attachments
        ? 'L’avoir est joint en PDF.\n'
        : 'Vous pouvez télécharger l’avoir depuis votre espace client (factures).\n') +
      '\nSFMC Bénin',
    attachments
  )
}

// Back-compat alias (older wiring)
export const onInventoryCriticalStock = onInventoryCritical
