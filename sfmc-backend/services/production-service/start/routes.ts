/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
const ProductionOrdersController = () => import('#controllers/production_orders_controller')

router.get('/health', () => {
    return { status: 'ok', service: 'production-service' }
})

router
  .group(() => {
    router.post('/production-orders', [ProductionOrdersController, 'create'])
    router.put('/production-orders/:id/status', [ProductionOrdersController, 'updateStatus'])
    router.post('/production-orders/:id/quality', [ProductionOrdersController, 'qualityControl'])
  })
  .prefix('/api/v1')
