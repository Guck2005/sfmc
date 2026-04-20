// @sfmc/event-contracts — Schémas RabbitMQ typés

import type { DomainEvent } from '@sfmc/shared-types'

export const EXCHANGE_NAME = 'sfmc.events'
export const EXCHANGE_TYPE = 'topic'
export const DLX_NAME = 'sfmc.dlx'
export const DLQ_NAME = 'sfmc.dlq'

export type EventType =
  // Order events
  | 'order.created'
  | 'order.validated'
  | 'order.cancelled'
  | 'order.shipped'
  | 'order.delivered'
  | 'order.production_required'
  // Production events
  | 'production.started'
  | 'production.completed'
  | 'production.quality_failed'
  | 'production.status_changed'
  // Inventory events
  | 'inventory.reserved'
  | 'inventory.reservation_failed'
  | 'inventory.critical'
  // Billing events
  | 'billing.invoice_created'
  // Auth / User events
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'user.role_changed'

export interface OrderCreatedPayload {
  orderId: string
  customerId: string
  lines: Array<{ productId: string; quantity: number; unitPrice: number }>
  totalAmount: number
}

export interface OrderValidatedPayload {
  orderId: string
  customerId: string
  customerEmail?: string
  totalAmount: number
}

export interface OrderCancelledPayload {
  orderId: string
  customerId: string
  customerEmail?: string
  reason?: string
  lines?: Array<{ productId: string; quantity: number }>
}

export interface OrderShippedPayload {
  orderId: string
  customerId: string
  customerEmail?: string
  shippedAt: string
}

export interface OrderDeliveredPayload {
  orderId: string
  customerId: string
  customerEmail?: string
  deliveredAt: string
}

export interface InvoiceCreatedPayload {
  invoiceId: string
  orderId: string
  customerId: string | null
  customerEmail?: string
  amount: number
  currency: string
}

export interface InventoryReservedPayload {
  sagaId: string
  orderId: string
  reservations: Array<{ productId: string; quantity: number }>
}

export interface InventoryReservationFailedPayload {
  sagaId: string
  orderId: string
  reason: string
  details?: Array<{ productId: string; requested: number; available: number }>
}

export interface InventoryCriticalPayload {
  productId: string
  warehouseId: string
  stockId: string
  available: number
  threshold: number
}

export interface ProductionCompletedPayload {
  productionOrderId: string
  orderId?: string
  productId: string
  warehouseId?: string
  quantity: number
}

export interface ProductionStatusChangedPayload {
  productionOrderId: string
  orderId?: string
  productId: string
  machineId: string | null
  fromStatus: string | null
  toStatus: string
  changedAt: string
}

export interface UserCreatedPayload {
  userId: string
  email: string
  fullName: string | null
  role: 'ADMIN' | 'OPERATOR' | 'CLIENT'
}

export interface UserUpdatedPayload {
  userId: string
  changes: Partial<{ email: string; fullName: string | null; role: string; isActive: boolean }>
}

export interface UserDeletedPayload {
  userId: string
}

export interface UserRoleChangedPayload {
  userId: string
  oldRole: 'ADMIN' | 'OPERATOR' | 'CLIENT'
  newRole: 'ADMIN' | 'OPERATOR' | 'CLIENT'
  changedBy: string | null
}

export function createEvent<T extends Record<string, unknown>>(
  type: EventType,
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
