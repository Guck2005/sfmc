import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173'

/**
 * Playwright E2E config — SFMC Bénin front-office.
 *
 * Les tests attendent :
 *   1. Backend complet démarré (`npm run start:full` dans sfmc-backend/) — ports 3001→3009
 *   2. Frontend Vite sur http://localhost:5173
 *   3. Bases seedées (admin@sfmc.bj / Admin@2026, operator@sfmc.bj / Operator@2026,
 *      client@sfmc.bj / Client@2026) + produits/stocks présents
 *
 * En local on démarre le dev server manuellement ; en CI on laisse Playwright
 * le démarrer via la propriété `webServer`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'fr-FR',
    timezoneId: 'Africa/Porto-Novo',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.CI
    ? {
        command: 'npm run dev -- --host 127.0.0.1 --port 5173',
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: 'ignore',
        stderr: 'pipe',
      }
    : undefined,
})
