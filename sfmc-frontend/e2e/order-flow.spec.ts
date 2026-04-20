import { test, expect } from '@playwright/test'
import { loginAs, resetLoginRateLimit, findAvailableFinishedProduct, ACCOUNTS } from './fixtures'

test.describe('CU-01 — Flux commande CLIENT ↔ OPERATOR via l\'UI', () => {
  test.beforeAll(async () => {
    await resetLoginRateLimit()
  })

  test('CLIENT crée une commande → OPERATOR l\'expédie puis la livre → CLIENT voit DELIVERED', async ({
    browser,
    request,
  }) => {
    const product = await findAvailableFinishedProduct(request, 1)
    test.skip(!product, 'Aucun produit fini avec stock disponible — test ignoré')

    // 1) Création de commande côté CLIENT via l'API (le formulaire UI est couvert manuellement ;
    //    on s'assure ici que l'espace CLIENT expose la commande et qu'on peut la voir aboutir à DELIVERED).
    const clientCtx = await browser.newContext()
    const clientPage = await clientCtx.newPage()
    const { token: clientToken } = await loginAs(clientPage, request, 'CLIENT', '/my-orders')

    const createResp = await request.post('/api/v1/orders', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        customerId: ACCOUNTS.CLIENT.id,
        lines: [{ productId: product!.productId, quantity: 1, unitPrice: product!.unitPrice }],
      },
      failOnStatusCode: false,
    })
    expect(createResp.status(), `POST /orders → ${await createResp.text()}`).toBe(201)
    const createBody = await createResp.json()
    const orderId = createBody.data.id as string
    expect(createBody.data.status).toBe('PENDING')

    // Attendre la saga (VALIDATED) — jusqu'à 10s
    await expect
      .poll(
        async () => {
          const r = await request.get(`/api/v1/orders/${orderId}`, {
            headers: { Authorization: `Bearer ${clientToken}` },
          })
          if (!r.ok()) return null
          return (await r.json()).data?.status
        },
        { timeout: 10_000, intervals: [500, 1000, 2000] }
      )
      .toBe('VALIDATED')

    // Rafraîchir "Mes commandes" et vérifier que la commande apparaît avec le statut Validée
    await clientPage.goto('/my-orders')
    await expect(clientPage.getByRole('cell', { name: new RegExp(orderId.slice(0, 8)) })).toBeVisible(
      { timeout: 15_000 }
    )

    // 2) OPERATOR : READY → SHIPPED → DELIVERED via l'UI OrderDetail
    const opCtx = await browser.newContext()
    const opPage = await opCtx.newPage()
    await loginAs(opPage, request, 'OPERATOR', `/orders/${orderId}`)

    // Attendre que la page OrderDetail soit chargée (timeline visible)
    await expect(opPage.getByText(/timeline saga/i)).toBeVisible({ timeout: 10_000 })

    // VALIDATED → READY
    await opPage.getByRole('button', { name: /marquer prête/i }).click()
    await expect(opPage.getByText(/commande → READY/i)).toBeVisible({ timeout: 5_000 })

    // READY → SHIPPED
    await expect(opPage.getByRole('button', { name: /^expédier$/i })).toBeVisible({
      timeout: 10_000,
    })
    await opPage.getByRole('button', { name: /^expédier$/i }).click()
    await expect(opPage.getByText(/commande → SHIPPED/i)).toBeVisible({ timeout: 5_000 })

    // SHIPPED → DELIVERED
    await expect(opPage.getByRole('button', { name: /^livrer$/i })).toBeVisible({ timeout: 10_000 })
    await opPage.getByRole('button', { name: /^livrer$/i }).click()
    await expect(opPage.getByText(/commande → DELIVERED/i)).toBeVisible({ timeout: 5_000 })

    // 3) CLIENT revient sur "Mes commandes" : statut DELIVERED visible
    await clientPage.goto('/my-orders')
    const row = clientPage.getByRole('row').filter({
      has: clientPage.getByRole('cell', { name: new RegExp(orderId.slice(0, 8)) }),
    })
    await expect(row.getByText(/livrée/i)).toBeVisible({ timeout: 15_000 })

    await clientCtx.close()
    await opCtx.close()
  })
})
