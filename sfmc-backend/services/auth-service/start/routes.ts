/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
*/

import router from '@adonisjs/core/services/router'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
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
  return response.status(allOk ? 200 : 503).send({
    status: allOk ? 'ok' : 'degraded',
    service: 'auth-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks,
  })
})

router
  .group(() => {
    router.post('/register', [() => import('#controllers/auth_controller'), 'register']).use(
      middleware.throttle()
    )
    router.post('/login', [() => import('#controllers/auth_controller'), 'login']).use(
      middleware.throttle()
    )
    router.post('/refresh', [() => import('#controllers/auth_controller'), 'refresh'])
    router.post('/logout', [() => import('#controllers/auth_controller'), 'logout'])
    router.post('/validate', [() => import('#controllers/auth_controller'), 'validate'])
    router.get('/oauth/authorize', [() => import('#controllers/auth_controller'), 'oauthAuthorize'])
    router.post('/oauth/token', [() => import('#controllers/auth_controller'), 'oauthToken'])
  })
  .prefix('/api/v1/auth')
