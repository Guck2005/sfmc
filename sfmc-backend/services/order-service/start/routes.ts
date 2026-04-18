/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import db from '@adonisjs/lucid/services/db'
import { isConnected as isRabbitConnected } from '#services/rabbitmq'
import type { HttpContext } from '@adonisjs/core/http'
import { HeaderMap } from '@apollo/server'
import { middleware } from '#start/kernel'

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
    service: 'order-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks,
  })
})

router
  .group(() => {
    router.post('/', [() => import('#controllers/orders_controller'), 'store'])
    router.get('/', [() => import('#controllers/orders_controller'), 'index'])
    router.get('/:id', [() => import('#controllers/orders_controller'), 'show'])
    router.post('/:id/cancel', [() => import('#controllers/orders_controller'), 'cancel'])
    router.put('/:id/status', [() => import('#controllers/orders_controller'), 'updateStatus'])
      .use(middleware.role(['OPERATOR']))
    router.delete('/:id', [() => import('#controllers/orders_controller'), 'destroy'])
  })
  .prefix('/api/v1/orders')
  .use(middleware.auth())

router
  .post('/graphql', async ({ request, response }: HttpContext) => {
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
