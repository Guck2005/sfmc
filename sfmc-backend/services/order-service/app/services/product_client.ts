import { request as undiciRequest } from 'undici'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

export type FetchProductResult =
  | { status: 'ok'; name: string }
  | { status: 'not_found' }
  | { status: 'unavailable' }

/**
 * GET product-service /api/v1/products/:id (route publique) pour figer le libellé à la commande.
 */
const DEFAULT_PRODUCT_SERVICE_URL = 'http://localhost:3003'

export async function fetchProductSnapshot(productId: string): Promise<FetchProductResult> {
  const baseUrl = (env.get('PRODUCT_SERVICE_URL') ?? DEFAULT_PRODUCT_SERVICE_URL).replace(/\/$/, '')
  const url = `${baseUrl}/api/v1/products/${productId}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    const res = await undiciRequest(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    if (res.statusCode === 404) return { status: 'not_found' }
    if (res.statusCode >= 500) {
      logger.warn({ productId, statusCode: res.statusCode }, '[product-client] catalogue 5xx')
      return { status: 'unavailable' }
    }
    if (res.statusCode !== 200) {
      logger.warn({ productId, statusCode: res.statusCode }, '[product-client] unexpected status')
      return { status: 'unavailable' }
    }
    const body = (await res.body.json()) as { data?: { name?: string }; name?: string }
    const row = body.data ?? body
    const name = typeof row?.name === 'string' ? row.name.trim() : ''
    if (!name) return { status: 'unavailable' }
    return { status: 'ok', name }
  } catch (err) {
    logger.warn({ err, productId }, '[product-client] fetch failed')
    return { status: 'unavailable' }
  } finally {
    clearTimeout(timer)
  }
}
