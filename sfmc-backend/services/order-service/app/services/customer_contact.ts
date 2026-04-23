import { request as undiciRequest } from 'undici'
import jwt from 'jsonwebtoken'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'

export interface CustomerContact {
  id: string
  email: string
  fullName: string | null
}

/**
 * Jeton court pour appels **machine → user-service** (même JWT_SECRET).
 * Rôle ADMIN requis car `UserPolicy.view` n'autorise que ADMIN ou soi-même.
 */
function buildServiceToken(): string {
  return jwt.sign(
    {
      sub: 'order-service',
      email: 'order-service@sfmc.internal',
      role: 'ADMIN',
    },
    env.get('JWT_SECRET'),
    { expiresIn: '5m' }
  )
}

/**
 * Fetch the customer contact info from user-service.
 * Returns null on any error (service down, user not found, timeout).
 * Never throws — callers must treat the result as best-effort.
 */
export async function fetchCustomerContact(customerId: string): Promise<CustomerContact | null> {
  const baseUrl = env.get('USER_SERVICE_URL')
  if (!baseUrl) return null

  const url = `${baseUrl}/api/v1/users/${customerId}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2000)
  try {
    const res = await undiciRequest(url, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${buildServiceToken()}`,
      },
      signal: controller.signal,
    })
    if (res.statusCode !== 200) {
      logger.warn(
        { customerId, status: res.statusCode },
        '[customer-contact] user-service returned non-200'
      )
      return null
    }
    const body = (await res.body.json()) as { data?: any }
    const user = body.data
    if (!user?.email) return null
    const combined = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
    const fullName =
      typeof user.fullName === 'string' && user.fullName.trim()
        ? user.fullName.trim()
        : combined || null
    return {
      id: user.id,
      email: user.email,
      fullName,
    }
  } catch (err) {
    logger.warn({ err, customerId }, '[customer-contact] fetch failed')
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchCustomerEmail(customerId: string): Promise<string | null> {
  const contact = await fetchCustomerContact(customerId)
  return contact?.email ?? null
}

export function formatCustomerDisplay(customerId: string, contact: CustomerContact | null): string {
  if (contact?.fullName?.trim()) return contact.fullName.trim()
  if (contact?.email) return contact.email
  return `Client ${customerId.slice(0, 8)}…`
}

/**
 * Résout les libellés affichables pour une liste d'IDs clients (requêtes parallèles par paquets).
 */
export async function resolveCustomerDisplayNames(customerIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(customerIds.filter(Boolean))]
  const map = new Map<string, string>()
  const chunkSize = 10
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const pairs = await Promise.all(
      chunk.map(async (id) => {
        const c = await fetchCustomerContact(id)
        return [id, formatCustomerDisplay(id, c)] as const
      })
    )
    for (const [id, label] of pairs) map.set(id, label)
  }
  return map
}
