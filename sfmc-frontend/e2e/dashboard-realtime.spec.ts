import { test, expect } from '@playwright/test'
import {
  loginAs,
  resetLoginRateLimit,
  findAvailableFinishedProduct,
  ACCOUNTS,
} from './fixtures'

test.describe('Rapports — indicateur de flux temps réel', () => {
  test.beforeAll(async () => {
    await resetLoginRateLimit()
  })

  test('Le badge "Flux temps réel" passe à `live` en moins de 5 s après une création de commande', async ({
    page,
    request,
  }) => {
    await loginAs(page, request, 'ADMIN', '/reports')

    // Le badge commence par "Connexion…" puis passe soit à "Flux temps réel"
    // (si reporting-service WS dispo), soit à "Offline" après 4 s.
    const badge = page.getByText(/flux temps réel|offline|connexion/i).first()
    await expect(badge).toBeVisible()

    // On déclenche un événement qui fera passer le reporting en `kpiUpdated`
    // via GraphQL Subscription → le badge passe en "Flux temps réel".
    const product = await findAvailableFinishedProduct(request, 1)
    test.skip(!product, 'Aucun stock produit fini disponible — test ignoré')

    // Login admin via l'API pour avoir un token
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: ACCOUNTS.ADMIN.email, password: ACCOUNTS.ADMIN.password },
      failOnStatusCode: false,
    })
    test.skip(
      !loginRes.ok(),
      `Login admin API KO (${loginRes.status()}) — rate-limit actif ?`
    )
    const token = (await loginRes.json()).data.accessToken as string

    await request.post('/api/v1/orders', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        customerId: ACCOUNTS.ADMIN.id,
        lines: [{ productId: product!.productId, quantity: 1, unitPrice: product!.unitPrice }],
      },
      failOnStatusCode: false,
    })

    // Attendre que le badge bascule en "Flux temps réel" en < 5 s
    await expect(page.getByText(/flux temps réel/i)).toBeVisible({ timeout: 5_000 })
  })
})
