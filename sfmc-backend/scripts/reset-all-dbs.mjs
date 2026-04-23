#!/usr/bin/env node
/**
 * Remet à zéro toutes les bases Postgres des microservices (migration:fresh)
 * puis injecte les jeux de données de démo **fictifs** (seeders).
 *
 * Prérequis : conteneurs Postgres du `docker-compose.yml` à la racine du
 * backend démarrés (`npm run infra:up`). RabbitMQ est attendu si un service
 * tente de s’y connecter au boot des commandes Ace.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * @param {string} serviceDir ex. `auth-service`
 * @param {string[]} aceArgs ex. `['migration:fresh', '--force']`
 */
function ace(serviceDir, aceArgs) {
  const cwd = join(backendRoot, 'services', serviceDir)
  const r = spawnSync('node', ['ace', ...aceArgs], { cwd, stdio: 'inherit', env: process.env })
  if (r.error) {
    console.error(r.error)
    process.exit(1)
  }
  if (r.status !== 0) {
    process.exit(r.status ?? 1)
  }
}

console.log('SFMC — reset BDD + seed démo (données fictives)\n')

/** Chemin relatif à la racine du service (exigé par `ace db:seed --files`). */
const S = (name) => `database/seeders/${name}`

ace('auth-service', ['migration:fresh', '--force'])
ace('auth-service', ['db:seed', '--files', S('user_seeder')])

ace('user-service', ['migration:fresh', '--force'])
ace('user-service', ['db:seed', '--files', S('user_seeder')])

ace('product-service', ['migration:fresh', '--force'])
ace('product-service', ['db:seed', '--files', S('product_seeder')])

ace('inventory-service', ['migration:fresh', '--force'])
ace('inventory-service', ['db:seed', '--files', S('warehouse_seeder')])

ace('order-service', ['migration:fresh', '--force'])
ace('order-service', ['db:seed', '--files', S('demo_orders_seeder')])

ace('production-service', ['migration:fresh', '--force'])
ace('production-service', [
  'db:seed',
  '--files',
  S('machine_seeder'),
  '--files',
  S('demo_production_orders_seeder'),
])

ace('billing-service', ['migration:fresh', '--force'])
ace('billing-service', ['db:seed', '--files', S('demo_billing_seeder')])

ace('notification-service', ['migration:fresh', '--force'])
ace('notification-service', ['db:seed', '--files', S('demo_notifications_seeder')])

ace('reporting-service', ['migration:fresh', '--force'])
ace('reporting-service', ['db:seed', '--files', S('demo_reporting_seeder')])

console.log('\nTerminé. Comptes démo auth : admin@sfmc.bj / Admin@2026 — operator@sfmc.bj / Operator@2026 — client@sfmc.bj / Client@2026')
