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
import { isConnected as isRabbitConnected } from '#services/rabbitmq'
import { middleware } from '#start/kernel'

const ProductionOrdersController = () => import('#controllers/production_orders_controller')
const MachinesController = () => import('#controllers/machines_controller')

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
    service: 'production-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks,
  })
})

router
  .group(() => {
    router.get('/production-orders', [ProductionOrdersController, 'index'])
    router.get('/production-orders/:id', [ProductionOrdersController, 'show'])
    router.post('/production-orders', [ProductionOrdersController, 'create'])
    router.put('/production-orders/:id/status', [ProductionOrdersController, 'updateStatus'])
    router.post('/production-orders/:id/quality', [ProductionOrdersController, 'qualityControl'])

    router.get('/machines', [MachinesController, 'index'])
    router.get('/machines/:id', [MachinesController, 'show'])
    router.post('/machines', [MachinesController, 'store'])
    router.put('/machines/:id/status', [MachinesController, 'updateStatus'])
  })
  .prefix('/api/v1')
  .use(middleware.auth())
  .use(middleware.role(['ADMIN', 'OPERATOR']))
