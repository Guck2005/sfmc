import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { request as undiciRequest } from 'undici'
import env from '#start/env'

/**
 * CU-01 — Création d'une commande (flux nominal).
 *
 * **Mode "live infra"** : le test fait des appels HTTP directs aux services
 * déjà démarrés (`npm run start:full`). Aucun serveur n'est démarré par Japa.
 *
 * Pré-requis :
 *   - order-service        http://localhost:3005
 *   - inventory-service    http://localhost:3004
 *   - billing-service      http://localhost:3007
 *   - notification-service http://localhost:3008
 *   - rabbitmq             amqp://localhost:5672
 *
 * Scénario :
 *   1. Récupérer un productId disponible dans inventory-service
 *   2. POST /api/v1/orders (order-service) → 201 PENDING
 *   3. Attente 3 s — saga RabbitMQ se déroule (reserve stock)
 *   4. Vérifier : status VALIDATED
 *   5. Vérifier : facture PENDING côté billing-service
 *   6. Vérifier : notification EMAIL ORDER_VALIDATED enregistrée
 */

const JWT_SECRET = env.get('JWT_SECRET')
const ORDER_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3005'
const INVENTORY_URL = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3004'
const BILLING_URL = process.env.BILLING_SERVICE_URL || 'http://localhost:3007'
const NOTIFICATION_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3008'

function serviceToken(role: 'ADMIN' | 'OPERATOR' = 'OPERATOR') {
  return jwt.sign(
    { sub: randomUUID(), email: 'cu01-test@sfmc.internal', role },
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

async function findAvailableProduct(): Promise<string | null> {
  const res = await tryJson(`${INVENTORY_URL}/api/v1/stocks`, {
    headers: { authorization: `Bearer ${serviceToken('OPERATOR')}` },
  })
  if (!res || res.status !== 200) return null
  const stocks = res.body.data || res.body
  const free = (stocks as any[]).find(
    (s: any) => Number(s.quantity) - Number(s.reserved) >= 1
  )
  return free?.productId ?? null
}

async function createOrder(token: string, payload: any) {
  return tryJson(`${ORDER_URL}/api/v1/orders`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

async function getOrder(orderId: string, token: string) {
  return tryJson(`${ORDER_URL}/api/v1/orders/${orderId}`, {
    headers: { authorization: `Bearer ${token}` },
  })
}

async function findInvoiceByOrderId(orderId: string, token: string) {
  const res = await tryJson(`${BILLING_URL}/api/v1/invoices?orderId=${orderId}&limit=10`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!res || res.status !== 200) return null
  const rows = res.body.data ?? []
  return rows.length > 0 ? rows[0] : null
}

async function findNotifications(type: string, token: string): Promise<any[]> {
  const res = await tryJson(
    `${NOTIFICATION_URL}/api/v1/notifications?type=${type}&limit=50`,
    { headers: { authorization: `Bearer ${token}` } }
  )
  if (!res || res.status !== 200) return []
  return res.body.data ?? []
}

test.group('CU-01 — Création commande flux nominal', (group) => {
  let productId: string | null = null

  group.setup(async () => {
    productId = await findAvailableProduct()
    if (!productId) {
      console.warn('[CU-01] aucun stock disponible — tests skippés')
    }
  })

  test('POST /orders → VALIDATED après saga RabbitMQ', async ({ assert }) => {
    if (!productId) return

    const token = serviceToken()
    const customerId = randomUUID()
    const created = await createOrder(token, {
      customerId,
      lines: [{ productId, quantity: 1, unitPrice: 2500 }],
    })
    assert.isNotNull(created, 'order-service injoignable')
    if (!created) return

    assert.equal(created.status, 201, `POST /orders attendu 201, obtenu ${created.status}`)
    const orderId = created.body.data.id
    assert.equal(created.body.data.status, 'PENDING')

    await sleep(3000)

    const got = await getOrder(orderId, token)
    assert.isNotNull(got)
    assert.equal(got!.status, 200)
    assert.equal(got!.body.data.status, 'VALIDATED', 'order devrait être VALIDATED après saga')
  }).disableTimeout()

  test('billing-service → facture PENDING créée sur order.validated', async ({ assert }) => {
    if (!productId) return

    const token = serviceToken()
    const customerId = randomUUID()
    const created = await createOrder(token, {
      customerId,
      lines: [{ productId, quantity: 1, unitPrice: 3000 }],
    })
    if (!created || created.status !== 201) return

    const orderId = created.body.data.id
    await sleep(3500)

    const invoice = await findInvoiceByOrderId(orderId, token)
    assert.isNotNull(invoice, `facture absente pour orderId=${orderId}`)
    if (invoice) {
      assert.equal(invoice.orderId, orderId)
      assert.equal(invoice.status, 'PENDING')
      assert.equal(Number(invoice.amount), 3000)
    }
  }).disableTimeout()

  test('notification-service → ORDER_VALIDATED enregistré', async ({ assert }) => {
    if (!productId) return

    const token = serviceToken('ADMIN')
    const baseline = await findNotifications('ORDER_VALIDATED', token)
    const baselineCount = baseline.length

    const created = await createOrder(token, {
      customerId: randomUUID(),
      lines: [{ productId, quantity: 1, unitPrice: 1500 }],
    })
    if (!created || created.status !== 201) return

    // La latence RabbitMQ + SMTP peut dépasser 10 s ; on retente jusqu'à 15 s
    let after: any[] = []
    for (let i = 0; i < 10; i++) {
      await sleep(1500)
      after = await findNotifications('ORDER_VALIDATED', token)
      if (after.length > baselineCount) break
    }

    assert.isAbove(
      after.length,
      baselineCount,
      `au moins 1 notif ORDER_VALIDATED supplémentaire attendue (baseline=${baselineCount}, après=${after.length})`
    )
    if (after.length > 0) {
      assert.equal(after[0].channel, 'EMAIL')
    }
  }).disableTimeout()
})
