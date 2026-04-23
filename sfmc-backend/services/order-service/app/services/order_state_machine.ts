import type { OrderStatus } from '#models/order'

/**
 * Chemin nominal saga / doc métier (référence — la validation réelle est dans `canTransition`).
 */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['VALIDATED', 'CANCELLED'],
  VALIDATED: ['IN_PRODUCTION', 'READY', 'CANCELLED'],
  IN_PRODUCTION: ['READY', 'CANCELLED'],
  READY: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
}

/** Statuts modifiables via `PUT /orders/:id/status` (l’annulation reste `POST …/cancel`). */
export const WORKFLOW_STATUSES: OrderStatus[] = [
  'PENDING',
  'VALIDATED',
  'IN_PRODUCTION',
  'READY',
  'SHIPPED',
  'DELIVERED',
]

/**
 * Back-office : transitions libres entre les états du workflow (y compris retours en arrière),
 * alignées sur le saga nominal pour les **terminaisons** :
 * - `CANCELLED` : plus aucun changement via PUT.
 * - `DELIVERED` : **état terminal** — plus de changement de statut (comme `TRANSITIONS.DELIVERED = []`).
 * Vers `CANCELLED` : uniquement pour `cancelOrder` (même périmètre qu’avant).
 */
export function canTransition(from: OrderStatus, to: OrderStatus, requiresProduction: boolean = false): boolean {
  if (from === 'CANCELLED') return false

  if (from === to) return true

  // Fin de saga : une fois livrée, on ne repasse pas à un état précédent via l’API.
  if (from === 'DELIVERED' && to !== 'DELIVERED') return false

  if (to === 'CANCELLED') {
    return ['PENDING', 'VALIDATED', 'IN_PRODUCTION', 'READY'].includes(from)
  }

  if (!WORKFLOW_STATUSES.includes(to)) return false
  if (!WORKFLOW_STATUSES.includes(from)) return false

  if (from === 'VALIDATED' && to === 'IN_PRODUCTION' && !requiresProduction) return false

  return true
}

export class InvalidTransitionError extends Error {
  public readonly code = 'INVALID_TRANSITION'
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Transition ${from} -> ${to} interdite`)
  }
}
