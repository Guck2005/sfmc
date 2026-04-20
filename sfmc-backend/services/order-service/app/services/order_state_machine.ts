import type { OrderStatus } from '#models/order'

export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['VALIDATED', 'CANCELLED'],
  VALIDATED: ['IN_PRODUCTION', 'READY', 'CANCELLED'],
  IN_PRODUCTION: ['READY', 'CANCELLED'],
  READY: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
}

export function canTransition(from: OrderStatus, to: OrderStatus, requiresProduction: boolean = false): boolean {
  if (from === 'VALIDATED' && to === 'IN_PRODUCTION' && !requiresProduction) {
    return false
  }
  return TRANSITIONS[from]?.includes(to) ?? false
}

export class InvalidTransitionError extends Error {
  public readonly code = 'INVALID_TRANSITION'
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Transition ${from} -> ${to} interdite`)
  }
}
