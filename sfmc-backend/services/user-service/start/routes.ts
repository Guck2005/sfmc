/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router.get('/health', async () => ({ status: 'ok', service: 'user-service' }))

router.group(() => {
  router.get('/', [() => import('#controllers/users_controller'), 'index'])
  router.post('/', [() => import('#controllers/users_controller'), 'store'])
  router.get('/:id', [() => import('#controllers/users_controller'), 'show'])
  router.put('/:id', [() => import('#controllers/users_controller'), 'update'])
  router.delete('/:id', [() => import('#controllers/users_controller'), 'destroy'])
  router.put('/:id/role', [() => import('#controllers/users_controller'), 'updateRole'])
}).prefix('/api/v1/users').use(middleware.auth())
