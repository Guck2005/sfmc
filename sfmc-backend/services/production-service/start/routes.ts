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
const ProductionOrdersController = () => import('#controllers/production_orders_controller')

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
    router.post('/production-orders', [ProductionOrdersController, 'create'])
    router.put('/production-orders/:id/status', [ProductionOrdersController, 'updateStatus'])
    router.post('/production-orders/:id/quality', [ProductionOrdersController, 'qualityControl'])
  })
  .prefix('/api/v1')
