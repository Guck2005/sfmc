/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import type { HttpContext } from '@adonisjs/core/http'
import { HeaderMap } from '@apollo/server'
import { middleware } from '#start/kernel'

router.get('/health', async () => ({ status: 'ok', service: 'order-service' }))

router
  .group(() => {
    router.post('/', [() => import('#controllers/orders_controller'), 'store'])
    router.get('/', [() => import('#controllers/orders_controller'), 'index'])
    router.get('/:id', [() => import('#controllers/orders_controller'), 'show'])
    router
      .put('/:id/status', [() => import('#controllers/orders_controller'), 'updateStatus'])
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
