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
  | 'inventory.pending_reception'
  // Billing events
  | 'billing.invoice_created'
  | 'billing.invoice_paid'
  | 'billing.credit_note_created'
  // Auth / User events
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'user.role_changed'

export interface OrderCreatedPayload {
  orderId: string
  /** Référence affichable type e-commerce (ex. CMD-2026-000042) */
  orderNumber: string
  customerId: string
  lines: Array<{
    productId: string
    quantity: number
    unitPrice: number
    /** Libellé figé depuis le catalogue au moment de la commande */
    productName: string
  }>
  totalAmount: number
}

export interface OrderValidatedPayload {
  orderId: string
  /** Même valeur que sur la commande (PDF facture, e-mails) */
  orderNumber: string
  customerId: string
  customerEmail?: string
  totalAmount: number
  currency?: string
  /**
   * Encaissement mobile money déjà confirmé avant validation commande.
   * Si présent : la facture doit être créée en PAID avec un paiement MOBILE_MONEY.
   */
  prepaidMobileMoney?: {
    providerReference: string
    phone: string
  }
}

export interface OrderCancelledPayload {
  orderId: string
  orderNumber?: string
  customerId: string
  customerEmail?: string
  reason?: string
  lines?: Array<{ productId: string; quantity: number }>
}

export interface OrderShippedAllocation {
  productId: string
  quantity: number
  warehouseId: string
}

export interface OrderShippedPayload {
  orderId: string
  orderNumber?: string
  customerId: string
  customerEmail?: string
  shippedAt: string
  lines: Array<{ productId: string; quantity: number }>
  /** Mono-entrepôt : tout depuis ce dépôt. */
  warehouseId?: string
  /** Multi-entrepôts : quantités par produit et par entrepôt (sommes = `lines` par produit). */
  allocations?: OrderShippedAllocation[]
}

export interface OrderDeliveredPayload {
  orderId: string
  orderNumber?: string
  customerId: string
  customerEmail?: string
  deliveredAt: string
}

export interface InvoiceCreatedPayload {
  invoiceId: string
  /** Numéro facture lisible (ex. FAC-2026-000012) */
  invoiceNumber: string
  orderId: string
  orderNumber?: string
  customerId: string | null
  customerEmail?: string
  amount: number
  currency: string
}

/** Facture entièrement acquittée (ex. après enregistrement paiement opérateur). */
export interface InvoicePaidPayload {
  invoiceId: string
  invoiceNumber: string
  orderId: string
  orderNumber?: string
  customerId: string | null
  customerEmail?: string | null
  amount: number
  currency: string
}

/** Avoir émis après annulation d’une commande déjà payée. */
export interface CreditNoteCreatedPayload {
  creditNoteId: string
  invoiceId: string
  invoiceNumber: string
  orderId: string
  orderNumber?: string
  customerId: string | null
  customerEmail?: string
  amount: number
  currency: string
  reason?: string
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

/** Émis par inventory-service après création d’une réception produit fini en attente (choix entrepôt). */
export interface InventoryPendingReceptionPayload {
  pendingEntryId: string
  productionOrderId: string
  productId: string
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
