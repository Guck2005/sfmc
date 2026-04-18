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
    service: 'user-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks,
  })
})

router.group(() => {
  router.get('/', [() => import('#controllers/users_controller'), 'index'])
  router.post('/', [() => import('#controllers/users_controller'), 'store'])
  router.get('/:id', [() => import('#controllers/users_controller'), 'show'])
  router.put('/:id', [() => import('#controllers/users_controller'), 'update'])
  router.delete('/:id', [() => import('#controllers/users_controller'), 'destroy'])
  router.put('/:id/role', [() => import('#controllers/users_controller'), 'updateRole'])
}).prefix('/api/v1/users').use(middleware.auth())
