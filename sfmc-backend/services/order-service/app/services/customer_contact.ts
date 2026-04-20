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
 * Generate a short-lived service JWT to call user-service as an OPERATOR.
 * JWT_SECRET is shared across services, so the token is valid everywhere.
 */
function buildServiceToken(): string {
  return jwt.sign(
    {
      sub: 'order-service',
      email: 'order-service@sfmc.internal',
      role: 'OPERATOR',
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
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName ?? null,
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
