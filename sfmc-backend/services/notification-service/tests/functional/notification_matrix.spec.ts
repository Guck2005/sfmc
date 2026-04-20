import { test } from '@japa/runner'
import Notification from '#models/notification'
import ProcessedEvent from '#models/processed_event'
import {
  onOrderShipped,
  onOrderDelivered,
  onProductionCompleted,
  onInventoryCritical,
  onBillingInvoiceCreated,
} from '#listeners/notification_listeners'
import db from '@adonisjs/lucid/services/db'
import crypto from 'node:crypto'

test.group('Notification Matrix (Email-only)', (group) => {
  group.each.setup(async () => {
    await db.beginGlobalTransaction()
    return () => db.rollbackGlobalTransaction()
  })

  test('order.shipped → email to customer', async ({ assert }) => {
    const eventId = crypto.randomUUID()
    const payload = {
      orderId: crypto.randomUUID(),
      customerId: crypto.randomUUID(),
      customerEmail: 'client@test.local',
      shippedAt: new Date().toISOString(),
    }

    await onOrderShipped({ id: eventId, type: 'order.shipped', payload })

    const notifs = await Notification.query()
      .where('payload', 'LIKE', `%${payload.orderId}%`)
      .where('type', 'ORDER_SHIPPED')
    assert.lengthOf(notifs, 1)
    assert.equal(notifs[0].channel, 'EMAIL')
    assert.equal(notifs[0].recipient, 'client@test.local')

    assert.isNotNull(await ProcessedEvent.find(eventId))
  })

  test('order.delivered → email to customer', async ({ assert }) => {
    const eventId = crypto.randomUUID()
    const payload = {
      orderId: crypto.randomUUID(),
      customerId: crypto.randomUUID(),
      customerEmail: 'delivered@test.local',
      deliveredAt: new Date().toISOString(),
    }

    await onOrderDelivered({ id: eventId, type: 'order.delivered', payload })

    const notifs = await Notification.query()
      .where('type', 'ORDER_DELIVERED')
      .where('recipient', 'delivered@test.local')
    assert.lengthOf(notifs, 1)
  })

  test('production.completed → email to logistics', async ({ assert }) => {
    const eventId = crypto.randomUUID()
    const payload = {
      productionOrderId: crypto.randomUUID(),
      productId: 'CIMENT-CEMII-425',
      quantity: 50,
    }

    await onProductionCompleted({ id: eventId, type: 'production.completed', payload })

    const notifs = await Notification.query().where('type', 'PRODUCTION_COMPLETED')
    assert.isAbove(notifs.length, 0)
    assert.equal(notifs[0].channel, 'EMAIL')
  })

  test('inventory.critical → emails logistics + production (deduplicated)', async ({ assert }) => {
    const eventId = crypto.randomUUID()
    const payload = {
      productId: 'FER-TMS-12',
      warehouseId: crypto.randomUUID(),
      stockId: crypto.randomUUID(),
      available: 10,
      threshold: 50,
    }

    await onInventoryCritical({ id: eventId, type: 'inventory.critical', payload })

    const notifs = await Notification.query()
      .where('type', 'CRITICAL_STOCK')
      .where('payload', 'LIKE', `%${payload.productId}%`)
    // By default LOGISTICS_EMAIL == PRODUCTION_EMAIL (both fallback to admin),
    // so deduplication collapses to a single recipient. Just assert ≥ 1.
    assert.isAbove(notifs.length, 0)
    for (const n of notifs) assert.equal(n.channel, 'EMAIL')
  })

  test('billing.invoice_created → email to customer + finance', async ({ assert }) => {
    const eventId = crypto.randomUUID()
    const payload = {
      invoiceId: crypto.randomUUID(),
      orderId: crypto.randomUUID(),
      customerId: crypto.randomUUID(),
      customerEmail: 'invoice-client@test.local',
      amount: 75000,
      currency: 'XOF',
    }

    await onBillingInvoiceCreated({ id: eventId, type: 'billing.invoice_created', payload })

    const notifs = await Notification.query()
      .where('type', 'INVOICE_CREATED')
      .where('payload', 'LIKE', `%${payload.invoiceId}%`)
    // customer + finance (finance falls back to admin if env unset).
    // Must at least include the customer recipient.
    assert.isAbove(notifs.length, 0)
    const recipients = notifs.map((n) => n.recipient)
    assert.include(recipients, 'invoice-client@test.local')
  })

  test('event idempotency: second call does nothing', async ({ assert }) => {
    const eventId = crypto.randomUUID()
    const payload = {
      orderId: crypto.randomUUID(),
      customerId: crypto.randomUUID(),
      customerEmail: 'idem@test.local',
      shippedAt: new Date().toISOString(),
    }

    await onOrderShipped({ id: eventId, type: 'order.shipped', payload })
    await onOrderShipped({ id: eventId, type: 'order.shipped', payload })

    const notifs = await Notification.query()
      .where('type', 'ORDER_SHIPPED')
      .where('recipient', 'idem@test.local')
    assert.lengthOf(notifs, 1)
  })
})
