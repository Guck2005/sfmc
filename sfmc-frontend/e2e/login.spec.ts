import { test, expect } from '@playwright/test'
import { ACCOUNTS, loginAs, resetLoginRateLimit } from './fixtures'

test.describe('Login + sidebar par rôle', () => {
  test.beforeAll(async () => {
    await resetLoginRateLimit()
  })

  test('CU — formulaire de login admin (UI complète) → redirection dashboard', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /connexion/i })).toBeVisible()

    await page.getByLabel('Email').fill(ACCOUNTS.ADMIN.email)
    await page.getByLabel('Mot de passe').fill(ACCOUNTS.ADMIN.password)
    await page.getByRole('button', { name: /se connecter/i }).click()

    await expect(page).toHaveURL(/\/$|\/(?!login)/, { timeout: 15_000 })
    // Sidebar visible → AppShell chargé
    await expect(page.getByRole('link', { name: /tableau de bord/i })).toBeVisible()
  })

  test('ADMIN — sidebar complet (Commandes + Stocks + Utilisateurs)', async ({ page, request }) => {
    await loginAs(page, request, 'ADMIN')
    await expect(page.getByRole('link', { name: /tableau de bord/i })).toBeVisible()

    await expect(page.getByRole('link', { name: /^commandes$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^stocks$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^production$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^facturation$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^rapports$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^utilisateurs$/i })).toBeVisible()

    // Pas d'entrée client
    await expect(page.getByRole('link', { name: /^mes commandes$/i })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /^mes factures$/i })).toHaveCount(0)
  })

  test('OPERATOR — pas d\'accès Utilisateurs, accès Stocks / Production / Facturation', async ({
    page,
    request,
  }) => {
    await loginAs(page, request, 'OPERATOR')

    await expect(page.getByRole('link', { name: /^commandes$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^stocks$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^production$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^facturation$/i })).toBeVisible()

    await expect(page.getByRole('link', { name: /^utilisateurs$/i })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /^mes commandes$/i })).toHaveCount(0)
  })

  test('CLIENT — espace restreint (Mes commandes / Mes factures), pas d\'accès back-office', async ({
    page,
    request,
  }) => {
    await loginAs(page, request, 'CLIENT')

    await expect(page.getByRole('link', { name: /^mes commandes$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^mes factures$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^produits$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^notifications$/i })).toBeVisible()

    // Sections ADMIN/OPERATOR absentes
    await expect(page.getByRole('link', { name: /^commandes$/i })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /^stocks$/i })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /^production$/i })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /^facturation$/i })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /^utilisateurs$/i })).toHaveCount(0)

    // Accès direct à /orders → ProtectedRoute affiche "Accès refusé"
    await page.goto('/orders')
    await expect(page.getByText(/accès refusé/i)).toBeVisible()
  })
})
