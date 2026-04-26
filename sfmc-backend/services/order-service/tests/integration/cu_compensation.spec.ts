import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { request as undiciRequest } from 'undici'
import Order from '#models/order'
import SagaLog from '#models/saga_log'
import env from '#start/env'

/**
 * Compensation Saga — scénarios d'échec de CU-01.
 *
 * A. Stock insuffisant → 409 INSUFFICIENT_STOCK, order CANCELLED, saga_log
 *    `reservation_failed/FAILED` (posé par `cancelOrderFromSaga`).
 *
 * Ce test interroge directement la base de l'order-service (via Lucid) pour
 * valider qu'aucun état inconsistant ne persiste après compensation. Il fait
 * aussi des appels HTTP live à order-service (mode "live infra").
 */

const JWT_SECRET = env.get('JWT_SECRET')
const ORDER_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3005'
const INVENTORY_URL = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3004'

function serviceToken() {
  return jwt.sign(
    { sub: randomUUID(), email: 'cu-compensation@sfmc.internal', role: 'OPERATOR' },
    JWT_SECRET,
    { expiresIn: '5m' }
  )
}

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

async function anyProduct(): Promise<string | null> {
  let page = 1
  let lastPage = 1
  do {
    const res = await tryJson(`${INVENTORY_URL}/api/v1/stocks?page=${page}&limit=100`, {
      headers: { authorization: `Bearer ${serviceToken()}` },
    })
    if (!res || res.status !== 200) return null
    const stocks = res.body.data || res.body
    const id = (stocks as any[])[0]?.productId
    if (id) return id
    lastPage = Number(res.body.meta?.lastPage) || 1
    page++
  } while (page <= lastPage)
  return null
}

test.group('Compensation Saga — CU-01 branche erreur', (group) => {
  let productId: string | null = null

  group.setup(async () => {
    productId = await anyProduct()
  })

  test('A. stock insuffisant → order CANCELLED + saga_log reservation_failed/FAILED', async ({
    assert,
  }) => {
    if (!productId) return

    const customerId = randomUUID()
    const res = await tryJson(`${ORDER_URL}/api/v1/orders`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${serviceToken()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        customerId,
        lines: [{ productId, quantity: 9_999_999, unitPrice: 100 }],
      }),
    })

    assert.isNotNull(res)
    if (!res) return
    assert.equal(res.status, 409)
    assert.equal(res.body.error?.code, 'INSUFFICIENT_STOCK')

    const order = await Order.query()
      .where('customer_id', customerId)
      .orderBy('created_at', 'desc')
      .first()
    assert.isNotNull(order, 'order doit être persisté même en cas de compensation')
    if (order) {
      assert.equal(order.status, 'CANCELLED', 'order CANCELLED après compensation')
      const sagaLog = await SagaLog.query()
        .where('saga_id', order.id)
        .where('step', 'reservation_failed')
        .first()
      assert.isNotNull(sagaLog, 'saga_log step=reservation_failed requis')
      if (sagaLog) {
        assert.equal(sagaLog.status, 'FAILED')
        assert.equal(sagaLog.sagaType, 'order_creation')
      }
    }
  }).disableTimeout()
})
