import logger from '@adonisjs/core/services/logger'
import { consume } from '#services/rabbitmq'
import {
  validateOrder,
  cancelOrderFromSaga,
  isEventProcessed,
  markEventProcessed,
  transitionStatus,
} from '#services/order_service'
import type {
  InventoryReservedPayload,
  InventoryReservationFailedPayload,
  ProductionCompletedPayload,
} from '@sfmc/event-contracts'

async function dedupe(eventId: string, eventType: string): Promise<boolean> {
  if (await isEventProcessed(eventId)) {
    logger.info({ eventId, eventType }, '[order] event already processed, skipping')
    return true
  }
  return false
}

export async function startOrderListeners(): Promise<void> {
  // inventory.reserved → PENDING → VALIDATED
  await consume({
    queue: 'order.inventory.reserved',
    routingKeys: ['inventory.reserved'],
    handler: async (event) => {
      if (await dedupe(event.id, event.type)) return
      const payload = event.payload as unknown as InventoryReservedPayload
      await validateOrder(payload.orderId, event.metadata.sagaId ?? payload.sagaId)
      await markEventProcessed(event.id, event.type)
      logger.info({ orderId: payload.orderId }, '[order] VALIDATED (saga step 3)')
    },
  })

  // inventory.reservation_failed → PENDING → CANCELLED (compensation)
  await consume({
    queue: 'order.inventory.reservation_failed',
    routingKeys: ['inventory.reservation_failed'],
    handler: async (event) => {
      if (await dedupe(event.id, event.type)) return
      const payload = event.payload as unknown as InventoryReservationFailedPayload
      await cancelOrderFromSaga(
        payload.orderId,
        payload.reason,
        event.metadata.sagaId ?? payload.sagaId
      )
      await markEventProcessed(event.id, event.type)
      logger.info(
        { orderId: payload.orderId, reason: payload.reason },
        '[order] CANCELLED (compensation)'
      )
    },
  })

  // production.completed → IN_PRODUCTION → READY
  await consume({
    queue: 'order.production.completed',
    routingKeys: ['production.completed'],
    handler: async (event) => {
      if (await dedupe(event.id, event.type)) return
      const payload = event.payload as unknown as ProductionCompletedPayload
      if (payload.orderId) {
        try {
          await transitionStatus(payload.orderId, 'READY')
        } catch (err) {
          logger.warn({ err, orderId: payload.orderId }, '[order] cannot transition to READY')
        }
      }
      await markEventProcessed(event.id, event.type)
    },
  })
}
