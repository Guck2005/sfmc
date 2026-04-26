import logger from '@adonisjs/core/services/logger'
import { consume, publishEvent } from '#services/rabbitmq'
import {
  isEventProcessed,
  markEventProcessed,
  confirmGlobalAvailabilityForOrder,
  releaseForOrder,
  InsufficientStockError,
  SERVICE_NAME,
} from '#services/stock_service'
import { createPendingFromProductionCompleted } from '#services/pending_stock_reception_service'
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
  // production.completed → réception produit fini en attente (choix entrepôt côté UI)
  await consume({
    queue: 'inventory.production.completed',
    routingKeys: ['production.completed'],
    handler: async (event) => {
      if (await dedupe(event.id, event.type)) return
      const payload = event.payload as unknown as ProductionCompletedPayload
      const pending = await createPendingFromProductionCompleted(payload, event.id)
      await publishEvent(
        createEvent(
          'inventory.pending_reception',
          {
            pendingEntryId: pending.id,
            productionOrderId: payload.productionOrderId,
            productId: payload.productId,
            quantity: payload.quantity,
          } as Record<string, unknown>,
          SERVICE_NAME,
          undefined,
          event.metadata?.correlationId ?? crypto.randomUUID()
        )
      )
      await markEventProcessed(event.id, event.type)
      logger.info(
        { event: event.type, productId: payload.productId, pendingId: pending.id },
        '[inventory] pending stock reception created'
      )
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

  // order.created → vérif dispo globale + emit inventory.reserved (entrepôt fixé à l’expédition)
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
        step: 'check_stock_availability',
        status: 'PENDING',
        payload: payload as unknown as Record<string, unknown>,
      })

      try {
        await confirmGlobalAvailabilityForOrder({ lines: payload.lines })
        await SagaLog.create({
          sagaId,
          sagaType: 'order_creation',
          step: 'check_stock_availability',
          status: 'COMPLETED',
          payload: { note: 'global_availability_no_warehouse_lock' } as unknown as Record<string, unknown>,
        })

        const reservedPayload: InventoryReservedPayload = {
          sagaId,
          orderId: payload.orderId,
          reservations: payload.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
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
        logger.info({ orderId: payload.orderId }, '[inventory] availability OK → inventory.reserved')
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
          step: 'check_stock_availability',
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
