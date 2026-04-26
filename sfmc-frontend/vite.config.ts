import path from 'node:path'
import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Mapping path-prefix -> microservice port. Frontend code targets
 * `/api/v1/<resource>/...` directly; Vite rewrites nothing and just
 * forwards to the correct upstream based on the first segment.
 */
const proxyMap: Record<string, string> = {
  '/api/v1/auth': 'http://localhost:3001',
  '/api/v1/users': 'http://localhost:3002',
  '/api/v1/products': 'http://localhost:3003',
  '/api/v1/machines': 'http://localhost:3006',
  /** GraphQL product-service (distinct du reporting sur `/graphql`). */
  '/api/product/graphql': 'http://localhost:3003',
  '/api/v1/warehouses': 'http://localhost:3004',
  '/api/v1/stocks': 'http://localhost:3004',
  /** GraphQL inventory-service (distinct du `/graphql` reporting sur :3009). */
  '/api/inventory/graphql': 'http://localhost:3004',
  '/api/v1/orders': 'http://localhost:3005',
  '/api/v1/webhooks': 'http://localhost:3005',
  '/api/v1/production-orders': 'http://localhost:3006',
  '/api/v1/invoices': 'http://localhost:3007',
  '/api/v1/payments': 'http://localhost:3007',
  '/api/v1/notifications': 'http://localhost:3008',
  '/api/v1/reports': 'http://localhost:3009',
  '/graphql': 'http://localhost:3009',
}

const proxy: Record<string, ProxyOptions> = Object.fromEntries(
  Object.entries(proxyMap).map(([prefix, target]) => [
    prefix,
    {
      target,
      changeOrigin: true,
      ws: prefix === '/graphql',
      ...(prefix === '/api/inventory/graphql'
        ? { rewrite: (p: string) => p.replace(/^\/api\/inventory\/graphql/, '/graphql') }
        : {}),
      ...(prefix === '/api/product/graphql'
        ? { rewrite: (p: string) => p.replace(/^\/api\/product\/graphql/, '/graphql') }
        : {}),
    },
  ])
)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy,
  },
})
