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
