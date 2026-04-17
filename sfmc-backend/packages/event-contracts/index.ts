// @sfmc/event-contracts — Schémas RabbitMQ typés

import type { DomainEvent } from '@sfmc/shared-types'

export const EXCHANGE_NAME = 'sfmc.events'
export const EXCHANGE_TYPE = 'topic'

export type EventType =
  // Order events
  | 'order.created'
  | 'order.validated'
  | 'order.cancelled'
  | 'order.shipped'
  | 'order.production_required'
  // Production events
  | 'production.started'
  | 'production.completed'
  | 'production.quality_failed'
  // Inventory events
  | 'inventory.reserved'
  | 'inventory.reservation_failed'
  | 'inventory.critical'
  // Billing events
  | 'billing.invoice_created'

export interface OrderCreatedPayload {
  orderId: string
  customerId: string
  lines: Array<{ productId: string; quantity: number; unitPrice: number }>
  totalAmount: number
}

export interface OrderValidatedPayload {
  orderId: string
  customerId: string
  totalAmount: number
}

export interface InventoryReservedPayload {
  sagaId: string
  orderId: string
  reservations: Array<{ productId: string; quantity: number }>
}

export interface ProductionCompletedPayload {
  productionOrderId: string
  orderId?: string
  productId: string
  quantity: number
}

export function createEvent<T extends Record<string, unknown>>(
  type: EventType,
  payload: T,
  sourceService: string,
  sagaId?: string
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type,
    version: '1.0',
    timestamp: new Date().toISOString(),
    payload,
    metadata: {
      sourceService,
      correlationId: crypto.randomUUID(),
      ...(sagaId ? { sagaId } : {}),
    },
  }
}
