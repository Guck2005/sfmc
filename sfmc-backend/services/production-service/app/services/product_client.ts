import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import type { MachineCategory } from '#models/machine'

export interface ProductContact {
  id: string
  name: string
  category: MachineCategory | null
  unitPrice?: number
}

/**
 * Fetch a product from product-service. Public GET endpoint — no auth needed.
 * Fails silently and returns null on any error (timeout, network, 404).
 */
export async function fetchProduct(productId: string): Promise<ProductContact | null> {
  const baseUrl = env.get('PRODUCT_SERVICE_URL')
  if (!baseUrl) return null

  const url = `${baseUrl}/api/v1/products/${productId}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2000)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) {
      logger.warn({ productId, status: res.status }, '[product-client] non-200')
      return null
    }
    const body = (await res.json()) as { data?: any }
    const p = body.data
    if (!p?.id) return null
    return {
      id: p.id,
      name: p.name,
      category: normalizeCategory(p.category),
      unitPrice: p.unitPrice ? Number(p.unitPrice) : undefined,
    }
  } catch (err) {
    logger.warn({ err, productId }, '[product-client] fetch failed')
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchProductCategory(productId: string): Promise<MachineCategory | null> {
  const product = await fetchProduct(productId)
  return product?.category ?? null
}

function normalizeCategory(raw: unknown): MachineCategory | null {
  if (typeof raw !== 'string') return null
  const upper = raw.trim().toUpperCase()
  if (upper === 'CIMENT' || upper === 'FER' || upper === 'BRIQUES' || upper === 'GRANULATS') {
    return upper
  }
  return null
}
