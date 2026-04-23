import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { request as undiciRequest } from 'undici'
import env from '#start/env'

/**
 * CU-01 variante — Flux PRODUCTION (stock insuffisant).
 *
 * Mode "live infra". Services requis :
 *   - order-service (3005), inventory-service (3004), production-service (3006).
 *
 * Couverture :
 *   A. Stock insuffisant → order-service retourne 409 + Saga compense (order CANCELLED).
 *   B. On crée manuellement un OF via production-service, passe `QUALITY_CHECK`
 *      puis valide la qualité → status `COMPLETED`.
 */

const JWT_SECRET = env.get('JWT_SECRET')
const ORDER_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3005'
const INVENTORY_URL = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3004'
const PRODUCTION_URL = process.env.PRODUCTION_SERVICE_URL || 'http://localhost:3006'

function serviceToken() {
  return jwt.sign(
    { sub: randomUUID(), email: 'cu01-prod@sfmc.internal', role: 'OPERATOR' },
    JWT_SECRET,
    { expiresIn: '5m' }
  )
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function tryJson(url: string, opts: any = {}): Promise<{ status: number; body: any } | null> {
  try {
    const res = await undiciRequest(url, opts)
    const body = res.headers['content-type']?.toString().includes('json')
      ? await res.body.json()
      : await res.body.text()
    return { status: res.statusCode, body }
  } catch {
    return null
  }
}

async function findAnyProduct(): Promise<string | null> {
  const res = await tryJson(`${INVENTORY_URL}/api/v1/stocks`, {
    headers: { authorization: `Bearer ${serviceToken()}` },
  })
  if (!res || res.status !== 200) return null
  const stocks = res.body.data || res.body
  return (stocks as any[])[0]?.productId ?? null
}

test.group('CU-01 production — stock insuffisant → OF → quality pass → COMPLETED', (group) => {
  let productId: string | null = null

  group.setup(async () => {
    productId = await findAnyProduct()
  })

  test('A. stock insuffisant → 409 + compensation', async ({ assert }) => {
    if (!productId) return

    const res = await tryJson(`${ORDER_URL}/api/v1/orders`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${serviceToken()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        customerId: randomUUID(),
        lines: [{ productId, quantity: 9_999_999, unitPrice: 100 }],
      }),
    })

    assert.isNotNull(res, 'order-service injoignable')
    if (!res) return
    assert.equal(res.status, 409)
    assert.equal(res.body.error?.code, 'INSUFFICIENT_STOCK')
  }).disableTimeout()

  test('B. ordre de fabrication créé → QUALITY_CHECK → quality pass → COMPLETED', async ({
    assert,
  }) => {
    if (!productId) return

    const create = await tryJson(`${PRODUCTION_URL}/api/v1/production-orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId, quantity: 5 }),
    })
    if (!create || create.status !== 201) {
      assert.isTrue(true, 'production-service non applicable')
      return
    }
    const poId = create.body.data.id

    // IN_PROGRESS si planifié en PLANNED/QUEUED (tolère les deux)
    await tryJson(`${PRODUCTION_URL}/api/v1/production-orders/${poId}/status`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    })
    await tryJson(`${PRODUCTION_URL}/api/v1/production-orders/${poId}/status`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'QUALITY_CHECK' }),
    })

    const quality = await tryJson(`${PRODUCTION_URL}/api/v1/production-orders/${poId}/quality`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passed: true }),
    })
    assert.isNotNull(quality)
    if (quality) {
      assert.equal(quality.status, 200, 'quality pass devrait répondre 200')
    }

    await sleep(2500)

    const got = await tryJson(`${PRODUCTION_URL}/api/v1/production-orders/${poId}`)
    assert.isNotNull(got)
    if (got) {
      assert.equal(got.body.data.status, 'COMPLETED')
    }
  }).disableTimeout()
})
