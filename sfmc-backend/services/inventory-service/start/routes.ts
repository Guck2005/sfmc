/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
*/

import router from '@adonisjs/core/services/router'
import db from '@adonisjs/lucid/services/db'
import { isConnected as isRabbitConnected } from '#services/rabbitmq'
import type { HttpContext } from '@adonisjs/core/http'
import { HeaderMap } from '@apollo/server'
import { middleware } from '#start/kernel'

/** Rôles autorisés pour la gestion stocks / entrepôts / GraphQL (aligné métier SFMC). */
const INVENTORY_ROLES = ['ADMIN', 'OPERATOR'] as const

router.get('/health', async ({ response }: HttpContext) => {
  const checks: Record<string, string> = {}
  let allOk = true
  try {
    await db.rawQuery('SELECT 1')
    checks.database = 'ok'
  } catch {
    checks.database = 'error'
    allOk = false
  }
  checks.rabbitmq = isRabbitConnected() ? 'ok' : 'error'
  if (checks.rabbitmq !== 'ok') allOk = false
  return response.status(allOk ? 200 : 503).send({
    status: allOk ? 'ok' : 'degraded',
    service: 'inventory-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks,
  })
})

/**
 * Inter-service : Order Service appelle ce endpoint sans JWT (circuit synchrone avant saga).
 * Ne pas protéger — le réseau / gateway doit limiter l’accès en production.
 */
router
  .group(() => {
    router.post('/check-availability', [
      () => import('#controllers/stocks_controller'),
      'checkAvailability',
    ])
  })
  .prefix('/api/v1/stocks')

router
  .group(() => {
    router.get('/', [() => import('#controllers/warehouses_controller'), 'index'])
    router.get('/:id', [() => import('#controllers/warehouses_controller'), 'show'])
    router.post('/', [() => import('#controllers/warehouses_controller'), 'create'])
    router.put('/:id', [() => import('#controllers/warehouses_controller'), 'update'])
    router.delete('/:id', [() => import('#controllers/warehouses_controller'), 'destroy'])
  })
  .prefix('/api/v1/warehouses')
  .use(middleware.auth())
  .use(middleware.role([...INVENTORY_ROLES]))

router
  .group(() => {
    router.get('/', [() => import('#controllers/stocks_controller'), 'index'])
    router.get('/alerts', [() => import('#controllers/stocks_controller'), 'alerts'])
    router.post('/reserve', [() => import('#controllers/stocks_controller'), 'reserve'])
    router.post('/release', [() => import('#controllers/stocks_controller'), 'release'])
    router.post('/movements', [() => import('#controllers/stocks_controller'), 'createMovement'])
    router.get('/movements', [() => import('#controllers/stocks_controller'), 'listMovements'])
    router.get('/pending-receptions', [
      () => import('#controllers/pending_stock_receptions_controller'),
      'index',
    ])
    router.post('/pending-receptions/:id/confirm', [
      () => import('#controllers/pending_stock_receptions_controller'),
      'confirm',
    ])
    router.put('/:id/threshold', [() => import('#controllers/stocks_controller'), 'updateThreshold'])
    router.get('/:productId/warehouses', [() => import('#controllers/stocks_controller'), 'byProduct'])
  })
  .prefix('/api/v1/stocks')
  .use(middleware.auth())
  .use(middleware.role([...INVENTORY_ROLES]))

router
  .group(() => {
    router.any('/graphql', async ({ request, response }: HttpContext) => {
      const { apolloServer } = await import('../app/graphql/schema.js')

      if (!(apolloServer as any).internals?.state?.phase?.startsWith('started')) {
        await apolloServer.start().catch(() => {})
      }

      const rawHeaders = request.headers() as Record<string, string | string[] | undefined>
      const headerMap = new HeaderMap(
        Object.entries(rawHeaders)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : (v as string)])
      )

      const httpGraphqlResponse = await apolloServer.executeHTTPGraphQLRequest({
        httpGraphQLRequest: {
          method: request.method().toUpperCase(),
          headers: headerMap,
          search: request.parsedUrl.search ?? '',
          body: () => Promise.resolve(request.body()),
        },
        context: async () => ({}),
      })

      for (const [key, value] of httpGraphqlResponse.headers) {
        response.header(key, value)
      }

      if (httpGraphqlResponse.body.kind === 'complete') {
        return response.status(httpGraphqlResponse.status ?? 200).send(httpGraphqlResponse.body.string)
      }

      return response.status(500).send('Streaming not supported')
    })
  })
  .use(middleware.auth())
  .use(middleware.role([...INVENTORY_ROLES]))
