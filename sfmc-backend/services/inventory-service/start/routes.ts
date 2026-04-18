/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
*/

import router from '@adonisjs/core/services/router'
import type { HttpContext } from '@adonisjs/core/http'
import { HeaderMap } from '@apollo/server'

router.get('/health', async () => ({ status: 'ok', service: 'inventory-service' }))

// Warehouses
router.group(() => {
  router.get('/', [() => import('#controllers/warehouses_controller'), 'index'])
  router.get('/:id', [() => import('#controllers/warehouses_controller'), 'show'])
}).prefix('/api/v1/warehouses')

// Stocks
router.group(() => {
  router.get('/', [() => import('#controllers/stocks_controller'), 'index'])
  router.get('/alerts', [() => import('#controllers/stocks_controller'), 'alerts'])
  router.post('/check-availability', [
    () => import('#controllers/stocks_controller'),
    'checkAvailability',
  ])
  router.post('/reserve', [() => import('#controllers/stocks_controller'), 'reserve'])
  router.post('/release', [() => import('#controllers/stocks_controller'), 'release'])
  router.post('/movements', [() => import('#controllers/stocks_controller'), 'createMovement'])
  router.get('/movements', [() => import('#controllers/stocks_controller'), 'listMovements'])
  router.put('/:id/threshold', [() => import('#controllers/stocks_controller'), 'updateThreshold'])
  router.get('/:productId/warehouses', [() => import('#controllers/stocks_controller'), 'byProduct'])
}).prefix('/api/v1/stocks')

// GraphQL endpoint
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
