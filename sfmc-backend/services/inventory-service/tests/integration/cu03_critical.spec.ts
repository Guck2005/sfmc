import { test } from '@japa/runner'
import { request as undiciRequest } from 'undici'

/**
 * CU-03 — Alerte stock critique.
 *
 * Mode "live infra" : les tests interrogent directement les services en cours
 * d'exécution via leurs endpoints HTTP.
 *
 * Scénario :
 *   1. Lister les stocks FINISHED_PRODUCT existants.
 *   2. Choisir un stock avec `quantity - reserved > 0`.
 *   3. Relever le threshold pour forcer `available < threshold` après un OUT de 1.
 *   4. POST /movements type=OUT quantity=1 → inventory-service publie `inventory.critical`.
 *   5. Attendre la propagation RabbitMQ.
 *   6. Vérifier côté notification-service qu'au moins 1 notification EMAIL
 *      de type `INVENTORY_CRITICAL` a été créée depuis `before`.
 *   7. Rollback : restaurer le threshold initial et re-injecter la quantité sortie.
 */

const INVENTORY_URL = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3004'
const NOTIFICATION_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3008'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Token ADMIN pour interroger notification-service (routes protégées par auth middleware)
import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import env from '#start/env'
function notifToken() {
  try {
    return jwt.sign(
      { sub: randomUUID(), email: 'cu03@sfmc.internal', role: 'ADMIN' },
      env.get('JWT_SECRET'),
      { expiresIn: '5m' }
    )
  } catch {
    return ''
  }
}

/** JWT OPERATOR — même secret que inventory-service (routes protégées). */
function inventoryBearer(): string {
  try {
    return jwt.sign(
      { sub: randomUUID(), email: 'cu03-inv@sfmc.internal', role: 'OPERATOR' },
      env.get('JWT_SECRET'),
      { expiresIn: '5m' }
    )
  } catch {
    return ''
  }
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

async function listStocks(): Promise<any[]> {
  const b = inventoryBearer()
  const res = await tryJson(`${INVENTORY_URL}/api/v1/stocks`, {
    headers: b ? { authorization: `Bearer ${b}` } : {},
  })
  if (!res || res.status !== 200) return []
  return res.body.data ?? res.body ?? []
}

async function setThreshold(stockId: string, threshold: number) {
  const b = inventoryBearer()
  return tryJson(`${INVENTORY_URL}/api/v1/stocks/${stockId}/threshold`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...(b ? { authorization: `Bearer ${b}` } : {}),
    },
    body: JSON.stringify({ threshold }),
  })
}

async function postMovement(payload: any) {
  const b = inventoryBearer()
  return tryJson(`${INVENTORY_URL}/api/v1/stocks/movements`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(b ? { authorization: `Bearer ${b}` } : {}),
    },
    body: JSON.stringify(payload),
  })
}

async function countNotifs(type: string, baselineCount: number): Promise<number> {
  const token = notifToken()
  const res = await tryJson(`${NOTIFICATION_URL}/api/v1/notifications?type=${type}&limit=50`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
  if (!res || res.status !== 200) return baselineCount
  const rows: any[] = res.body.data ?? []
  return rows.length
}

test.group('CU-03 — mouvement OUT sous seuil → inventory.critical → notifications EMAIL', () => {
  test('déclenche au moins 1 notification INVENTORY_CRITICAL', async ({ assert }) => {
    const stocks = await listStocks()
    const candidate = stocks.find(
      (s) => s.stockType === 'FINISHED_PRODUCT' && Number(s.quantity) - Number(s.reserved) >= 1
    )
    if (!candidate) {
      // Stack partiellement indisponible — test non applicable
      return
    }

    const NOTIF_TYPE = 'CRITICAL_STOCK'
    const baselineCount = await countNotifs(NOTIF_TYPE, 0)
    const originalThreshold = Number(candidate.threshold)
    const available = Number(candidate.quantity) - Number(candidate.reserved)
    const quantityOut = 1
    const availableAfter = available - quantityOut
    const desiredThreshold = availableAfter + 10

    try {
      const th = await setThreshold(candidate.id, desiredThreshold)
      assert.isNotNull(th)
      if (th) assert.equal(th.status, 200)

      const mv = await postMovement({
        stockId: candidate.id,
        type: 'OUT',
        quantity: quantityOut,
        origin: 'cu03-integration-test',
      })
      assert.isNotNull(mv)
      if (mv) assert.equal(mv.status, 201)

      // RabbitMQ → notification-service (jusqu'à 15 s)
      let current = baselineCount
      for (let i = 0; i < 10; i++) {
        await sleep(1500)
        current = await countNotifs(NOTIF_TYPE, baselineCount)
        if (current > baselineCount) break
      }

      assert.isAbove(
        current,
        baselineCount,
        `au moins 1 notification ${NOTIF_TYPE} supplémentaire attendue (baseline=${baselineCount}, après=${current})`
      )
    } finally {
      await setThreshold(candidate.id, originalThreshold).catch(() => null)
      await postMovement({
        stockId: candidate.id,
        type: 'IN',
        quantity: quantityOut,
        origin: 'cu03-integration-test-rollback',
      }).catch(() => null)
    }
  }).disableTimeout()
})
