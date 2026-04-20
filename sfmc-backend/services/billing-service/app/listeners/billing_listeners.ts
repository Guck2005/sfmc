import Invoice from '#models/invoice'
import ProcessedEvent from '#models/processed_event'
import logger from '@adonisjs/core/services/logger'
import { publishEvent } from '#services/rabbitmq'
import type { DomainEvent } from '@sfmc/shared-types'
import type { InvoiceCreatedPayload } from '@sfmc/event-contracts'

const SERVICE_NAME = 'billing-service'

function createEvent<T extends Record<string, unknown>>(
  type: string,
  payload: T,
  sagaId?: string
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type,
    version: '1.0',
    timestamp: new Date().toISOString(),
    payload,
    metadata: {
      sourceService: SERVICE_NAME,
      correlationId: crypto.randomUUID(),
      ...(sagaId ? { sagaId } : {}),
    },
  }
}

/**
 * Consumer: order.validated → Génère automatiquement une facture PENDING
 * Payload attendu: { orderId, customerId, totalAmount, currency, items }
 */
export async function onOrderValidated(event: any) {
  logger.info({ eventId: event.id }, '[billing] received order.validated')

  // Idempotency check — critical: prevents duplicate invoices on message replay
  const alreadyProcessed = await ProcessedEvent.find(event.id)
  if (alreadyProcessed) {
    logger.info({ eventId: event.id }, '[billing] event already processed, skipping')
    return
  }

  const payload = event.payload

  // Also check if an invoice already exists for this orderId (belt and suspenders)
  const existing = await Invoice.findBy('orderId', payload.orderId)
  if (existing) {
    logger.warn({ orderId: payload.orderId }, '[billing] invoice already exists for this order')
    await ProcessedEvent.create({ eventId: event.id, eventType: event.type })
    return
  }

  const invoice = await Invoice.create({
    orderId: payload.orderId,
    customerId: payload.customerId || null,
    amount: payload.totalAmount,
    currency: payload.currency || 'XOF',
    status: 'PENDING',
  })

  logger.info(
    { invoiceId: invoice.id, orderId: payload.orderId, amount: invoice.amount },
    '[billing] PENDING invoice created'
  )

  const invoicePayload: InvoiceCreatedPayload = {
    invoiceId: invoice.id,
    orderId: invoice.orderId,
    customerId: invoice.customerId,
    customerEmail: payload.customerEmail,
    amount: Number(invoice.amount),
    currency: invoice.currency,
  }
  try {
    await publishEvent(
      createEvent('billing.invoice_created', invoicePayload as unknown as Record<string, unknown>, invoice.orderId)
    )
  } catch (err) {
    logger.warn({ err, invoiceId: invoice.id }, '[billing] failed to publish invoice_created')
  }

  await ProcessedEvent.create({ eventId: event.id, eventType: event.type })
}

/**
 * Consumer: order.cancelled → Annule la facture correspondante
 * Payload attendu: { orderId }
 */
export async function onOrderCancelled(event: any) {
  logger.info({ eventId: event.id }, '[billing] received order.cancelled')

  const alreadyProcessed = await ProcessedEvent.find(event.id)
  if (alreadyProcessed) {
    logger.info({ eventId: event.id }, '[billing] event already processed, skipping')
    return
  }

  const payload = event.payload
  const invoice = await Invoice.findBy('orderId', payload.orderId)

  if (!invoice) {
    logger.warn({ orderId: payload.orderId }, '[billing] no invoice found for cancelled order')
    await ProcessedEvent.create({ eventId: event.id, eventType: event.type })
    return
  }

  if (invoice.status === 'PAID') {
    // If already paid, issue a credit note or refund
    logger.info(
      { invoiceId: invoice.id },
      '[billing] invoice already PAID — issuing REFUND'
    )
    invoice.status = 'REFUNDED'
  } else {
    invoice.status = 'CANCELLED'
  }
  await invoice.save()

  logger.info({ invoiceId: invoice.id, newStatus: invoice.status }, '[billing] invoice updated')
  await ProcessedEvent.create({ eventId: event.id, eventType: event.type })
}
