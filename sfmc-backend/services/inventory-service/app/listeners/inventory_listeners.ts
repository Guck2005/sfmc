import logger from '@adonisjs/core/services/logger'
import { consume, publishEvent } from '#services/rabbitmq'
import {
  isEventProcessed,
  markEventProcessed,
  incrementFinishedStock,
  reserveForOrder,
  releaseForOrder,
  InsufficientStockError,
  SERVICE_NAME,
} from '#services/stock_service'
import SagaLog from '#models/saga_log'
import { DateTime } from 'luxon'
import {
  type OrderCreatedPayload,
  type OrderCancelledPayload,
  type ProductionCompletedPayload,
  type InventoryReservedPayload,
  type InventoryReservationFailedPayload,
} from '@sfmc/event-contracts'
import { type DomainEvent } from '@sfmc/shared-types'

async function dedupe(eventId: string, eventType: string): Promise<boolean> {
  if (await isEventProcessed(eventId)) {
    logger.info({ eventId, eventType }, '[inventory] event already processed, skipping')
    return true
  }
  return false
}

function createEvent<T extends Record<string, unknown>>(
  type: string,
  payload: T,
  sourceService: string,
  sagaId?: string,
  correlationId?: string
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type,
    version: '1.0',
    timestamp: new Date().toISOString(),
    payload,
    metadata: {
      sourceService,
      correlationId: correlationId ?? crypto.randomUUID(),
      ...(sagaId ? { sagaId } : {}),
    },
  }
}

export async function startInventoryListeners(): Promise<void> {
  // production.completed → increment FINISHED_PRODUCT stock
  await consume({
    queue: 'inventory.production.completed',
    routingKeys: ['production.completed'],
    handler: async (event) => {
      if (await dedupe(event.id, event.type)) return
      const payload = event.payload as unknown as ProductionCompletedPayload
      await incrementFinishedStock({
        productId: payload.productId,
        warehouseId: payload.warehouseId,
        quantity: payload.quantity,
        referenceId: payload.productionOrderId,
      })
      await markEventProcessed(event.id, event.type)
      logger.info({ event: event.type, productId: payload.productId }, '[inventory] stock incremented')
    },
  })

  // order.cancelled → release reservations
  await consume({
    queue: 'inventory.order.cancelled',
    routingKeys: ['order.cancelled'],
    handler: async (event) => {
      if (await dedupe(event.id, event.type)) return
      const payload = event.payload as unknown as OrderCancelledPayload
      if (payload.lines && payload.lines.length > 0) {
        await releaseForOrder({ orderId: payload.orderId, lines: payload.lines })
      }
      await markEventProcessed(event.id, event.type)
      logger.info({ orderId: payload.orderId }, '[inventory] reservation released')
    },
  })

  // order.created → reserve stock + emit inventory.reserved OR inventory.reservation_failed
  await consume({
    queue: 'inventory.order.created',
    routingKeys: ['order.created'],
    handler: async (event) => {
      if (await dedupe(event.id, event.type)) return
      const payload = event.payload as unknown as OrderCreatedPayload
      const sagaId = event.metadata.sagaId ?? payload.orderId

      await SagaLog.create({
        sagaId,
        sagaType: 'order_creation',
        step: 'reserve_stock',
        status: 'PENDING',
        payload: payload as unknown as Record<string, unknown>,
      })

      try {
        const { reservations } = await reserveForOrder({
          orderId: payload.orderId,
          lines: payload.lines,
        })
        await SagaLog.create({
          sagaId,
          sagaType: 'order_creation',
          step: 'reserve_stock',
          status: 'COMPLETED',
          payload: { reservations } as unknown as Record<string, unknown>,
        })

        const reservedPayload: InventoryReservedPayload = {
          sagaId,
          orderId: payload.orderId,
          reservations: reservations.map((r) => ({ productId: r.productId, quantity: r.quantity })),
        }
        await publishEvent(
          createEvent(
            'inventory.reserved',
            reservedPayload as unknown as Record<string, unknown>,
            SERVICE_NAME,
            sagaId,
            event.metadata.correlationId
          )
        )
        logger.info({ orderId: payload.orderId }, '[inventory] reserved → inventory.reserved')
      } catch (err) {
        const failedPayload: InventoryReservationFailedPayload = {
          sagaId,
          orderId: payload.orderId,
          reason:
            err instanceof InsufficientStockError ? err.message : (err as Error).message,
          details:
            err instanceof InsufficientStockError
              ? [{ productId: err.productId, requested: err.requested, available: err.available }]
              : undefined,
        }
        await SagaLog.create({
          sagaId,
          sagaType: 'order_creation',
          step: 'reserve_stock',
          status: 'FAILED',
          payload: failedPayload as unknown as Record<string, unknown>,
        })
        await publishEvent(
          createEvent(
            'inventory.reservation_failed',
            failedPayload as unknown as Record<string, unknown>,
            SERVICE_NAME,
            sagaId,
            event.metadata.correlationId
          )
        )
        logger.warn(
          { orderId: payload.orderId, reason: failedPayload.reason },
          '[inventory] reservation failed → inventory.reservation_failed'
        )
      }
      await markEventProcessed(event.id, event.type)
    },
  })
}

export async function persistSagaSnapshot(
  sagaId: string,
  step: string,
  status: 'PENDING' | 'COMPLETED' | 'COMPENSATING' | 'FAILED',
  payload?: Record<string, unknown>
): Promise<void> {
  await SagaLog.create({
    sagaId,
    sagaType: 'order_creation',
    step,
    status,
    payload: payload ?? null,
    createdAt: DateTime.now(),
  })
}
