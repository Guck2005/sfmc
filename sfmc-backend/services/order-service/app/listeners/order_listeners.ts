import logger from '@adonisjs/core/services/logger'
import { consume } from '#services/rabbitmq'
import Order from '#models/order'
import { isPaymentGateEnabled } from '#services/mobile_money_config'
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
      const sagaId = event.metadata.sagaId ?? payload.sagaId

      if (isPaymentGateEnabled()) {
        const order = await Order.findOrFail(payload.orderId)
        if (order.status !== 'PENDING') {
          await markEventProcessed(event.id, event.type)
          return
        }
        order.paymentStatus = 'AWAITING_MOBILE_MONEY'
        order.sagaStatus = 'AWAITING_PAYMENT'
        await order.save()
        await markEventProcessed(event.id, event.type)
        logger.info(
          { orderId: payload.orderId },
          '[order] stock OK — en attente paiement mobile money (stub)'
        )
        return
      }

      await validateOrder(payload.orderId, sagaId)
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
