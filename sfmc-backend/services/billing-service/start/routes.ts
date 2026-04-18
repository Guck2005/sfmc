/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
const InvoicesController = () => import('#controllers/invoices_controller')

router.get('/health', () => {
  return { status: 'ok', service: 'billing-service' }
})

router
  .group(() => {
    router.get('/invoices/:id', [InvoicesController, 'show'])
    router.post('/invoices/:id/payments', [InvoicesController, 'recordPayment'])
    router.get('/invoices/:id/pdf', [InvoicesController, 'pdf'])
  })
  .prefix('/api/v1')
