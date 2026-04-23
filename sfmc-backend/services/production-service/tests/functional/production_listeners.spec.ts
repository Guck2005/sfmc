import { test } from '@japa/runner'
import ProductionOrder from '#models/production_order'
import ProcessedEvent from '#models/processed_event'
import { onOrderProductionRequired, onOrderCancelled } from '#listeners/production_listeners'
import db from '@adonisjs/lucid/services/db'
import crypto from 'node:crypto'

test.group('Production Listeners', (group) => {
  group.each.setup(async () => {
    await db.beginGlobalTransaction()
    return () => db.rollbackGlobalTransaction()
  })

  test('onOrderProductionRequired creates PLANNED production orders', async ({ assert }) => {
    const eventId = crypto.randomUUID()
    const payload = {
      orderId: crypto.randomUUID(),
      items: [
        { productId: crypto.randomUUID(), quantity: 10 },
        { productId: crypto.randomUUID(), quantity: 5 }
      ]
    }

    await onOrderProductionRequired({ id: eventId, type: 'order.production_required', payload })

    // Check if POs were created
    const orders = await ProductionOrder.query().where('orderId', payload.orderId)
    assert.lengthOf(orders, 2)
    assert.equal(orders[0].status, 'PLANNED')
    assert.equal(orders[1].status, 'PLANNED')

    // Check if event was processed
    const processed = await ProcessedEvent.find(eventId)
    assert.isNotNull(processed)
  })

  test('onOrderCancelled cancels PLANNED production orders', async ({ assert }) => {
    const orderId = crypto.randomUUID()
    const po = await ProductionOrder.create({
      orderId,
      productId: crypto.randomUUID(),
      quantity: 10,
      status: 'PLANNED'
    })

    const eventId = crypto.randomUUID()
    await onOrderCancelled({ id: eventId, type: 'order.cancelled', payload: { orderId } })

    await po.refresh()
    assert.equal(po.status, 'CANCELLED')
  })

  test('onOrderCancelled cancels IN_PROGRESS production orders', async ({ assert }) => {
    const orderId = crypto.randomUUID()
    const po = await ProductionOrder.create({
      orderId,
      productId: crypto.randomUUID(),
      quantity: 10,
      status: 'IN_PROGRESS'
    })

    const eventId = crypto.randomUUID()
    await onOrderCancelled({ id: eventId, type: 'order.cancelled', payload: { orderId } })

    await po.refresh()
    assert.equal(po.status, 'CANCELLED')
  })
})
