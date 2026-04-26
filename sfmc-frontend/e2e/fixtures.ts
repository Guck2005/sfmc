import { expect, type Page, type APIRequestContext } from '@playwright/test'

import { paginationMeta } from '../src/lib/pagination'

export type Role = 'ADMIN' | 'OPERATOR' | 'CLIENT'

interface Credentials {
  email: string
  password: string
  id: string
}

/** Comptes seedés par `auth-service/database/seeders/user_seeder.ts`. */
export const ACCOUNTS: Record<Role, Credentials> = {
  ADMIN: {
    email: 'admin@sfmc.bj',
    password: 'Admin@2026',
    id: 'aaaaaaaa-aaaa-4aaa-aaaa-000000000001',
  },
  OPERATOR: {
    email: 'operator@sfmc.bj',
    password: 'Operator@2026',
    id: 'aaaaaaaa-aaaa-4aaa-aaaa-000000000002',
  },
  CLIENT: {
    email: 'client@sfmc.bj',
    password: 'Client@2026',
    id: 'aaaaaaaa-aaaa-4aaa-aaaa-000000000003',
  },
}

interface LoginApiResponse {
  data: {
    accessToken: string
    refreshToken: string
    tokenType: string
    expiresIn: number
    user: { id: string; email: string; role: Role }
  }
}

/**
 * Purge la fenêtre rate-limit Redis pour `/auth/login` afin que la suite
 * Playwright ne soit pas bloquée par des runs précédents (5 req / 15 min).
 *
 * En CI on laisse la responsabilité au job précédent ; en local on utilise
 * `docker exec sfmc-redis redis-cli ...` en best-effort (échec silencieux).
 */
export async function resetLoginRateLimit(): Promise<void> {
  if (process.env.CI) return
  try {
    const { spawnSync } = await import('node:child_process')
    spawnSync(
      'docker',
      [
        'exec',
        'sfmc-redis',
        'redis-cli',
        'EVAL',
        "for _,k in ipairs(redis.call('keys','ratelimit:login:*')) do redis.call('del',k) end",
        '0',
      ],
      { stdio: 'ignore' }
    )
  } catch {
    /* best-effort */
  }
}

/**
 * Authentifie un rôle **sans passer par le formulaire UI** :
 *   1. POST direct vers `/api/v1/auth/login`
 *   2. écriture du store Zustand `sfmc-auth` dans localStorage
 *   3. navigation vers `path` (par défaut `/`)
 *
 * Cela évite de saturer le rate-limit auth (5 req / 15 min / IP) sur les suites
 * qui enchaînent plusieurs rôles.
 */
export async function loginAs(
  page: Page,
  request: APIRequestContext,
  role: Role,
  path: string = '/'
): Promise<{ token: string; userId: string }> {
  const creds = ACCOUNTS[role]
  const res = await request.post('/api/v1/auth/login', {
    data: { email: creds.email, password: creds.password },
    failOnStatusCode: false,
  })
  if (!res.ok()) {
    throw new Error(
      `Login ${role} échoué (${res.status()}) — ${await res.text()}. ` +
        `Assure-toi que la stack est seedée et que le rate-limit Redis est purgé.`
    )
  }
  const body = (await res.json()) as LoginApiResponse
  const token = body.data.accessToken
  const user = body.data.user
  const persisted = JSON.stringify({
    state: {
      token,
      refreshToken: body.data.refreshToken,
      user: { id: user.id, email: user.email, role: user.role },
    },
    version: 0,
  })
  await page.addInitScript((value) => {
    window.localStorage.setItem('sfmc-auth', value)
  }, persisted)
  await page.goto(path)
  return { token, userId: user.id }
}

/** Retourne le premier produit ayant du stock disponible ≥ `minQty`. */
export async function findAvailableFinishedProduct(
  request: APIRequestContext,
  minQty = 1
): Promise<{ productId: string; unitPrice: number } | null> {
  let page = 1
  let lastPage = 1
  do {
    const stocksRes = await request.get(`/api/v1/stocks?page=${page}&limit=100`, {
      failOnStatusCode: false,
    })
    if (!stocksRes.ok()) return null
    const stocksBody = await stocksRes.json()
    const stocks = (stocksBody.data ?? stocksBody ?? []) as Array<{
      productId: string
      quantity: number | string
      reserved: number | string
    }>
    const candidate = stocks.find((s) => Number(s.quantity) - Number(s.reserved) >= minQty)
    if (candidate) {
      const productRes = await request.get(`/api/v1/products/${candidate.productId}`, {
        failOnStatusCode: false,
      })
      let unitPrice = 1000
      if (productRes.ok()) {
        const pbody = await productRes.json()
        const product = (pbody.data ?? pbody) as { unitPrice?: number }
        if (product?.unitPrice != null) unitPrice = Number(product.unitPrice)
      }
      return { productId: candidate.productId, unitPrice }
    }
    lastPage = paginationMeta(stocksBody)?.lastPage ?? 1
    page++
  } while (page <= lastPage)
  return null
}

export async function waitForUrlMatch(
  page: Page,
  pattern: RegExp,
  timeout = 15_000
): Promise<void> {
  await expect(page).toHaveURL(pattern, { timeout })
}
