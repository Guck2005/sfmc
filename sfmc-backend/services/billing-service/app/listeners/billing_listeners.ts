import { randomUUID } from 'node:crypto'
import Invoice from '#models/invoice'
import Payment from '#models/payment'
import CreditNote from '#models/credit_note'
import ProcessedEvent from '#models/processed_event'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { publishEvent } from '#services/rabbitmq'
import {
  currentInvoiceYear,
  formatInvoicePublicNumber,
  nextInvoiceSequence,
} from '#services/reference_sequence'
import type { DomainEvent } from '@sfmc/shared-types'
import type { CreditNoteCreatedPayload, InvoiceCreatedPayload } from '@sfmc/event-contracts'
import { publishBillingEvent } from '#services/billing_event_publish'

const SERVICE_NAME = 'billing-service'

function createEvent<T extends Record<string, unknown>>(
  type: string,
  payload: T,
  sagaId?: string
): DomainEvent {
  return {
    id: randomUUID(),
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

  const orderPublicNumber =
    typeof payload.orderNumber === 'string' && payload.orderNumber.trim().length > 0
      ? payload.orderNumber.trim()
      : null

  const prepaid = payload.prepaidMobileMoney

  const invoice = await db.transaction(async (trx) => {
    const year = currentInvoiceYear()
    const seq = await nextInvoiceSequence(trx, year)
    const invoiceNumber = formatInvoicePublicNumber(year, seq)
    const inv = await Invoice.create(
      {
        orderId: payload.orderId,
        orderPublicNumber,
        invoiceNumber,
        customerId: payload.customerId || null,
        customerEmail: payload.customerEmail?.trim() || null,
        amount: payload.totalAmount,
        currency: payload.currency || 'XOF',
        status: prepaid?.providerReference ? 'PAID' : 'PENDING',
      },
      { client: trx }
    )
    if (prepaid?.providerReference) {
      await Payment.create(
        {
          invoiceId: inv.id,
          amount: Number(payload.totalAmount),
          method: 'MOBILE_MONEY',
        },
        { client: trx }
      )
    }
    return inv
  })

  logger.info(
    {
      invoiceId: invoice.id,
      orderId: payload.orderId,
      amount: invoice.amount,
      status: invoice.status,
    },
    prepaid?.providerReference
      ? '[billing] invoice created PAID (prepaid mobile money)'
      : '[billing] PENDING invoice created'
  )

  const invoicePayload: InvoiceCreatedPayload = {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    orderId: invoice.orderId,
    orderNumber: invoice.orderPublicNumber ?? undefined,
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
    logger.info(
      { invoiceId: invoice.id },
      '[billing] invoice already PAID — statut REFUNDED + création avoir'
    )
    invoice.status = 'REFUNDED'
    await invoice.save()

    const existingNote = await CreditNote.findBy('invoiceId', invoice.id)
    if (!existingNote) {
      const reasonText =
        typeof payload.reason === 'string' && payload.reason.trim().length > 0
          ? `Annulation : ${payload.reason}`
          : 'Annulation commande après paiement'
      const note = await CreditNote.create({
        id: randomUUID(),
        invoiceId: invoice.id,
        orderId: invoice.orderId,
        customerId: invoice.customerId,
        amount: Number(invoice.amount),
        currency: invoice.currency,
        reason: reasonText,
      })
      logger.info({ invoiceId: invoice.id }, '[billing] credit note (avoir) created')

      const creditPayload: CreditNoteCreatedPayload = {
        creditNoteId: note.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        orderId: invoice.orderId,
        orderNumber: invoice.orderPublicNumber ?? undefined,
        customerId: invoice.customerId,
        customerEmail: payload.customerEmail,
        amount: Number(invoice.amount),
        currency: invoice.currency,
        reason: reasonText,
      }
      try {
        await publishBillingEvent(
          'billing.credit_note_created',
          creditPayload as unknown as Record<string, unknown>,
          invoice.orderId
        )
      } catch (err) {
        logger.warn({ err, invoiceId: invoice.id }, '[billing] failed to publish credit_note_created')
      }
    }
  } else {
    invoice.status = 'CANCELLED'
    await invoice.save()
  }

  logger.info({ invoiceId: invoice.id, newStatus: invoice.status }, '[billing] invoice updated')
  await ProcessedEvent.create({ eventId: event.id, eventType: event.type })
}
