import { randomUUID } from 'node:crypto'
import logger from '@adonisjs/core/services/logger'
import { publishEvent } from '#services/rabbitmq'
import type ProductionOrder from '#models/production_order'
import type { ProductionStatusChangedPayload } from '@sfmc/event-contracts'

const SERVICE_NAME = 'production-service'

/**
 * Emit a `production.status_changed` event used by reporting-service to
 * project the live progress of a production order onto the GraphQL
 * subscription `productionOrderUpdated(id)`.
 */
export async function publishProductionStatusChanged(
  po: ProductionOrder,
  fromStatus: string | null,
  toStatus: string
): Promise<void> {
  const payload: ProductionStatusChangedPayload = {
    productionOrderId: po.id,
    orderId: po.orderId ?? undefined,
    productId: po.productId,
    machineId: po.machineId ?? null,
    fromStatus,
    toStatus,
    changedAt: new Date().toISOString(),
  }
  try {
    await publishEvent({
      id: randomUUID(),
      type: 'production.status_changed',
      version: '1.0',
      timestamp: new Date().toISOString(),
      payload: payload as unknown as Record<string, unknown>,
      metadata: {
        sourceService: SERVICE_NAME,
        correlationId: po.orderId ?? po.id,
      },
    } as any)
  } catch (err) {
    logger.warn({ err, poId: po.id, toStatus }, '[production] failed to publish status_changed')
  }
}

/**
 * Émet `production.completed` (réception stock en attente, passage commande READY, reporting, etc.).
 * À appeler pour tout passage à COMPLETED : contrôle qualité OK ou changement de statut manuel équivalent.
 */
export async function publishProductionCompleted(
  po: ProductionOrder,
  opts?: { notes?: string | null }
): Promise<void> {
  try {
    await publishEvent({
      id: randomUUID(),
      type: 'production.completed',
      version: '1.0',
      timestamp: new Date().toISOString(),
      payload: {
        productionOrderId: po.id,
        orderId: po.orderId ?? undefined,
        productId: po.productId,
        quantity: po.quantity,
        ...(opts?.notes != null && String(opts.notes).trim() !== ''
          ? { notes: String(opts.notes).trim() }
          : {}),
      },
      metadata: {
        sourceService: SERVICE_NAME,
        correlationId: po.orderId ?? po.id,
      },
    } as any)
  } catch (err) {
    logger.warn({ err, poId: po.id }, '[production] failed to publish production.completed')
  }
}
