/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'

router.get('/health', async () => ({ status: 'ok', service: 'auth-service' }))

router.group(() => {
  router.post('/login', [() => import('#controllers/auth_controller'), 'login'])
  router.post('/refresh', [() => import('#controllers/auth_controller'), 'refresh'])
  router.post('/logout', [() => import('#controllers/auth_controller'), 'logout'])
  router.post('/validate', [() => import('#controllers/auth_controller'), 'validate'])
  router.get('/oauth/authorize', [() => import('#controllers/auth_controller'), 'oauthAuthorize'])
  router.post('/oauth/token', [() => import('#controllers/auth_controller'), 'oauthToken'])
}).prefix('/api/v1/auth')
