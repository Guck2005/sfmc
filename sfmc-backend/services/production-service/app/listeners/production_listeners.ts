import ProductionOrder from '#models/production_order'
import ProcessedEvent from '#models/processed_event'
import logger from '@adonisjs/core/services/logger'

export async function onOrderProductionRequired(event: any) {
  logger.info({ eventId: event.id }, '[production] received order.production_required')

  // Idempotency check
  const alreadyProcessed = await ProcessedEvent.find(event.id)
  if (alreadyProcessed) {
    logger.info({ eventId: event.id }, '[production] event already processed, skipping')
    return
  }

  // The payload should contain lines/items that need production
  // As per architecture, one order can require production. We'll simply create a production order for each line
  // Let's assume payload carries { orderId, items: [{ productId, quantity }] }
  const payload = event.payload

  if (!payload.items || !Array.isArray(payload.items)) {
     logger.warn({ eventId: event.id }, '[production] missing items in payload')
     return
  }

  for (const item of payload.items) {
      await ProductionOrder.create({
        productId: item.productId,
        quantity: item.quantity,
        orderId: payload.orderId,
        status: 'PLANNED',
      })
      logger.info({ orderId: payload.orderId, productId: item.productId }, '[production] created PLANNED production order')
  }

  await ProcessedEvent.create({ eventId: event.id, eventType: event.type })
}

export async function onOrderCancelled(event: any) {
  logger.info({ eventId: event.id }, '[production] received order.cancelled')

  const alreadyProcessed = await ProcessedEvent.find(event.id)
  if (alreadyProcessed) {
    logger.info({ eventId: event.id }, '[production] event already processed, skipping')
    return
  }

  const payload = event.payload
  if (!payload.orderId) return

  const prodOrders = await ProductionOrder.query().where('orderId', payload.orderId)
  
  for (const po of prodOrders) {
    if (po.status === 'PLANNED') {
      po.status = 'CANCELLED'
      await po.save()
      logger.info({ poId: po.id }, '[production] cancelled PLANNED production order')
    } else {
      logger.warn({ poId: po.id, status: po.status }, '[production] could not cancel production order (already in progress/completed)')
    }
  }

  await ProcessedEvent.create({ eventId: event.id, eventType: event.type })
}
