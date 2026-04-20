/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
*/

import router from '@adonisjs/core/services/router'
import type { HttpContext } from '@adonisjs/core/http'
import { HeaderMap } from '@apollo/server'
import db from '@adonisjs/lucid/services/db'
import { isConnected as isRabbitConnected } from '#services/rabbitmq'

router.get('/health', async ({ response }: HttpContext) => {
  const checks: Record<string, string> = {}
  let allOk = true

  try {
    await db.rawQuery('SELECT 1')
    checks.database = 'ok'
  } catch (err) {
    checks.database = 'error'
    allOk = false
  }

  checks.rabbitmq = isRabbitConnected() ? 'ok' : 'error'
  if (checks.rabbitmq !== 'ok') allOk = false

  const body = {
    status: allOk ? 'ok' : 'degraded',
    service: 'reporting-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks,
  }
  return response.status(allOk ? 200 : 503).send(body)
})

router
  .group(() => {
    router.get('/reports/dashboard', [
      () => import('#controllers/reports_controller'),
      'dashboard',
    ])
    router.get('/reports/sales', [() => import('#controllers/reports_controller'), 'sales'])
    router.get('/reports/production', [
      () => import('#controllers/reports_controller'),
      'production',
    ])
    router.get('/reports/quality', [() => import('#controllers/reports_controller'), 'quality'])
    router.get('/reports/stock', [() => import('#controllers/reports_controller'), 'stock'])
    router.get('/reports/:type/export.csv', [
      () => import('#controllers/reports_controller'),
      'exportCsv',
    ])
  })
  .prefix('/api/v1')

router.post('/graphql', async ({ request, response }: HttpContext) => {
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
      body: request.body(),
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
