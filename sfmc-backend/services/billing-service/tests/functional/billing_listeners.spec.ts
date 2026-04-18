import { test } from '@japa/runner'
import Invoice from '#models/invoice'
import ProcessedEvent from '#models/processed_event'
import { onOrderValidated, onOrderCancelled } from '#listeners/billing_listeners'
import db from '@adonisjs/lucid/services/db'
import crypto from 'node:crypto'

test.group('Billing Listeners', (group) => {
  group.each.setup(async () => {
    await db.beginGlobalTransaction()
    return () => db.rollbackGlobalTransaction()
  })

  test('onOrderValidated creates a PENDING invoice', async ({ assert }) => {
    const eventId = crypto.randomUUID()
    const payload = {
      orderId: crypto.randomUUID(),
      customerId: crypto.randomUUID(),
      totalAmount: 15000,
      currency: 'XOF',
    }

    await onOrderValidated({ id: eventId, type: 'order.validated', payload })

    // Check if invoice was created
    const invoice = await Invoice.findBy('orderId', payload.orderId)
    assert.isNotNull(invoice)
    assert.equal(invoice!.status, 'PENDING')
    assert.equal(Number(invoice!.amount), 15000)

    // Check if event was processed
    const processed = await ProcessedEvent.find(eventId)
    assert.isNotNull(processed)
  })

  test('onOrderCancelled cancels a PENDING invoice', async ({ assert }) => {
    const orderId = crypto.randomUUID()
    
    // Seed invoice
    await Invoice.create({
      orderId,
      customerId: crypto.randomUUID(),
      amount: 15000,
      currency: 'XOF',
      status: 'PENDING',
    })

    const eventId = crypto.randomUUID()
    await onOrderCancelled({ id: eventId, type: 'order.cancelled', payload: { orderId } })

    const invoice = await Invoice.findBy('orderId', orderId)
    assert.equal(invoice!.status, 'CANCELLED')
  })

  test('onOrderCancelled refunds a PAID invoice', async ({ assert }) => {
    const orderId = crypto.randomUUID()
    
    // Seed invoice
    await Invoice.create({
      orderId,
      customerId: crypto.randomUUID(),
      amount: 15000,
      currency: 'XOF',
      status: 'PAID',
    })

    const eventId = crypto.randomUUID()
    await onOrderCancelled({ id: eventId, type: 'order.cancelled', payload: { orderId } })

    const invoice = await Invoice.findBy('orderId', orderId)
    assert.equal(invoice!.status, 'REFUNDED')
  })

  test('listeners are idempotent', async ({ assert }) => {
    const eventId = crypto.randomUUID()
    const payload = {
      orderId: crypto.randomUUID(),
      customerId: crypto.randomUUID(),
      totalAmount: 15000,
      currency: 'XOF',
    }

    // First call
    await onOrderValidated({ id: eventId, type: 'order.validated', payload })
    
    // Second call with same event id
    await onOrderValidated({ id: eventId, type: 'order.validated', payload })

    // Should only have 1 invoice created
    const invoices = await Invoice.query().where('orderId', payload.orderId)
    assert.lengthOf(invoices, 1)
  })
})
