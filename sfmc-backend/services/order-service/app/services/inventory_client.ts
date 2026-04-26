import CircuitBreaker from 'opossum'
import { request as undiciRequest } from 'undici'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

export interface CheckAvailabilityResult {
  available: boolean
  currentStock: number
  productId: string
}

async function rawCheckAvailability(params: {
  productId: string
  quantity: number
}): Promise<CheckAvailabilityResult> {
  const url = `${env.get('INVENTORY_SERVICE_URL')}/api/v1/stocks/check-availability`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2000)
  try {
    const res = await undiciRequest(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    })
    if (res.statusCode >= 500) throw new Error(`Inventory 5xx: ${res.statusCode}`)
    const body = (await res.body.json()) as { data: CheckAvailabilityResult }
    return body.data
  } finally {
    clearTimeout(timer)
  }
}

export const checkAvailabilityBreaker = new CircuitBreaker(rawCheckAvailability, {
  timeout: 2000,
  errorThresholdPercentage: 50,
  resetTimeout: 10000,
  volumeThreshold: 5,
  rollingCountTimeout: 10000,
})

checkAvailabilityBreaker.fallback(() => {
  logger.warn('[inventory-client] circuit breaker fallback: service unavailable')
  return null
})

checkAvailabilityBreaker.on('open', () => logger.warn('[inventory-client] circuit OPEN'))
checkAvailabilityBreaker.on('halfOpen', () => logger.info('[inventory-client] circuit HALF-OPEN'))
checkAvailabilityBreaker.on('close', () => logger.info('[inventory-client] circuit CLOSED'))

export async function checkAvailability(
  params: { productId: string; quantity: number }
): Promise<CheckAvailabilityResult | null> {
  return (await checkAvailabilityBreaker.fire(params)) as CheckAvailabilityResult | null
}

export type FulfillShipmentLine = { productId: string; quantity: number }

export type ShipmentAllocationInput = {
  productId: string
  quantity: number
  warehouseId: string
}

export type FulfillShipmentOutcome =
  | { ok: true; alreadyFulfilled: boolean }
  | { ok: false; reason: 'inventory_unavailable' }
  | { ok: false; reason: 'allocation_mismatch'; message: string }
  | {
      ok: false
      reason: 'insufficient_stock'
      productId: string
      requested: number
      available: number
    }

async function rawFulfillShipment(params: {
  orderId: string
  lines: FulfillShipmentLine[]
  warehouseId?: string
  allocations?: ShipmentAllocationInput[]
}): Promise<FulfillShipmentOutcome> {
  const url = `${env.get('INVENTORY_SERVICE_URL')}/api/v1/stocks/fulfill-shipment`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await undiciRequest(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    })
    if (res.statusCode >= 500) {
      logger.warn({ status: res.statusCode }, '[inventory-client] fulfill-shipment 5xx')
      return { ok: false, reason: 'inventory_unavailable' }
    }
    if (res.statusCode === 422) {
      const body = (await res.body.json()) as { error?: { message?: string } }
      return {
        ok: false,
        reason: 'allocation_mismatch',
        message: body.error?.message ?? 'Répartition d’expédition invalide',
      }
    }
    if (res.statusCode === 409) {
      const body = (await res.body.json()) as {
        error?: { details?: { productId: string; requested: number; available: number } }
      }
      const d = body.error?.details
      if (d?.productId) {
        return {
          ok: false,
          reason: 'insufficient_stock',
          productId: d.productId,
          requested: d.requested,
          available: d.available,
        }
      }
      return { ok: false, reason: 'inventory_unavailable' }
    }
    if (res.statusCode !== 200) {
      logger.warn({ status: res.statusCode }, '[inventory-client] fulfill-shipment unexpected status')
      return { ok: false, reason: 'inventory_unavailable' }
    }
    const body = (await res.body.json()) as { data?: { alreadyFulfilled?: boolean } }
    return { ok: true, alreadyFulfilled: !!body.data?.alreadyFulfilled }
  } finally {
    clearTimeout(timer)
  }
}

export const fulfillShipmentBreaker = new CircuitBreaker(rawFulfillShipment, {
  timeout: 6000,
  errorThresholdPercentage: 50,
  resetTimeout: 10000,
  volumeThreshold: 5,
  rollingCountTimeout: 10000,
})

fulfillShipmentBreaker.fallback(() => {
  logger.warn('[inventory-client] fulfill circuit breaker fallback')
  return { ok: false, reason: 'inventory_unavailable' as const }
})

fulfillShipmentBreaker.on('open', () => logger.warn('[inventory-client] fulfill circuit OPEN'))

export async function fulfillShipment(params: {
  orderId: string
  lines: FulfillShipmentLine[]
  warehouseId?: string
  allocations?: ShipmentAllocationInput[]
}): Promise<FulfillShipmentOutcome> {
  return (await fulfillShipmentBreaker.fire(params)) as FulfillShipmentOutcome
}
