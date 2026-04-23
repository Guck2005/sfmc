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
import type { HttpContext } from '@adonisjs/core/http'
import { HeaderMap } from '@apollo/server'
import { middleware } from '#start/kernel'
import {
  isGraphqlMutation,
  verifyJwtPayload,
  type GraphqlAuthUser,
} from '#services/graphql_auth'

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
  return response.status(allOk ? 200 : 503).send({
    status: allOk ? 'ok' : 'degraded',
    service: 'product-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks,
  })
})

router.group(() => {
  router.get('/', [() => import('#controllers/products_controller'), 'index'])
  router.get('/:id', [() => import('#controllers/products_controller'), 'show'])
}).prefix('/api/v1/products')

router
  .group(() => {
    router.post('/', [() => import('#controllers/products_controller'), 'store'])
    router.put('/:id', [() => import('#controllers/products_controller'), 'update'])
    router.delete('/:id', [() => import('#controllers/products_controller'), 'destroy'])
  })
  .prefix('/api/v1/products')
  .use(middleware.auth())
  .use(middleware.role(['ADMIN']))

router.any('/graphql', async ({ request, response }: HttpContext) => {
  const body = request.body() as { query?: string; operationName?: string } | undefined
  const queryStr = body?.query ?? (request.input('query') as string | undefined) ?? ''
  const operationName =
    body?.operationName ?? (request.input('operationName') as string | undefined)

  let graphqlAuth: GraphqlAuthUser | undefined
  if (isGraphqlMutation(queryStr, operationName)) {
    const auth = verifyJwtPayload(request.header('Authorization'))
    if (auth === 'missing') {
      return response.unauthorized({
        error: {
          code: 'MISSING_TOKEN',
          message: 'Token requis pour les mutations GraphQL',
        },
      })
    }
    if (auth === 'invalid') {
      return response.unauthorized({
        error: { code: 'INVALID_TOKEN', message: 'Token invalide ou expiré' },
      })
    }
    if (auth.role !== 'ADMIN') {
      return response.forbidden({
        error: {
          code: 'FORBIDDEN',
          message: 'Les mutations GraphQL sont réservées au rôle ADMIN',
        },
      })
    }
    graphqlAuth = auth
  }

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
    context: async () => ({ auth: graphqlAuth }),
  })

  for (const [key, value] of httpGraphqlResponse.headers) {
    response.header(key, value)
  }

  if (httpGraphqlResponse.body.kind === 'complete') {
    return response.status(httpGraphqlResponse.status ?? 200).send(httpGraphqlResponse.body.string)
  }

  return response.status(500).send('Streaming not supported')
})
