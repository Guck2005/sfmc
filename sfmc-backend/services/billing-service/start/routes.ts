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
const InvoicesController = () => import('#controllers/invoices_controller')

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
    service: 'billing-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks,
  })
})

router
  .group(() => {
    router.get('/invoices', [InvoicesController, 'index'])
    router.get('/invoices/:id', [InvoicesController, 'show'])
    router.get('/invoices/:id/payments', [InvoicesController, 'listPayments'])
    router.post('/invoices/:id/payments', [InvoicesController, 'recordPayment'])
    router.get('/invoices/:id/pdf', [InvoicesController, 'pdf'])
    router.get('/invoices/:id/credit-note', [InvoicesController, 'creditNote'])
    router.get('/invoices/:id/credit-note/pdf', [InvoicesController, 'creditNotePdf'])
  })
  .prefix('/api/v1')
  .use(middleware.auth())
