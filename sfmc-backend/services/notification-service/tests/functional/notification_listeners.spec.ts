import { test } from '@japa/runner'
import Notification from '#models/notification'
import ProcessedEvent from '#models/processed_event'
import { onOrderValidated, onOrderCancelled } from '#listeners/notification_listeners'
import db from '@adonisjs/lucid/services/db'
import crypto from 'node:crypto'

test.group('Notification Listeners', (group) => {
  group.each.setup(async () => {
    await db.beginGlobalTransaction()
    return () => db.rollbackGlobalTransaction()
  })

  test('onOrderValidated creates a notification record', async ({ assert }) => {
    const eventId = crypto.randomUUID()
    const payload = {
      orderId: crypto.randomUUID(),
      customerId: crypto.randomUUID(),
      totalAmount: 15000,
      currency: 'XOF',
    }

    await onOrderValidated({ id: eventId, type: 'order.validated', payload })

    // Check if notification was created
    const notifs = await Notification.query().where('payload', 'LIKE', `%${payload.orderId}%`)
    assert.lengthOf(notifs, 1)
    assert.equal(notifs[0].type, 'ORDER_VALIDATED')
    assert.equal(notifs[0].status, 'SENT')

    // Check if event was processed
    const processed = await ProcessedEvent.find(eventId)
    assert.isNotNull(processed)
  })

  test('onOrderCancelled creates a notification record', async ({ assert }) => {
    const eventId = crypto.randomUUID()
    const payload = {
      orderId: crypto.randomUUID(),
    }

    await onOrderCancelled({ id: eventId, type: 'order.cancelled', payload })

    // Check if notification was created for cancellation
    const notifs = await Notification.query()
      .where('payload', 'LIKE', `%${payload.orderId}%`)
      .where('type', 'ORDER_CANCELLED')
    
    assert.lengthOf(notifs, 1)
    assert.equal(notifs[0].status, 'SENT')
  })
})
