/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),
  DB_SSL: Env.schema.boolean.optional(),
  JWT_SECRET: Env.schema.string(),
  RABBITMQ_URL: Env.schema.string(),
  INVENTORY_SERVICE_URL: Env.schema.string(),
  PRODUCT_SERVICE_URL: Env.schema.string.optional(),
  USER_SERVICE_URL: Env.schema.string.optional(),
  /**
   * true = après réservation stock, la commande attend une confirmation de paiement (webhook signé)
   * avant `order.validated`.
   */
  REQUIRE_PAYMENT_BEFORE_VALIDATION: Env.schema.boolean.optional(),
  /** @deprecated — si true, équivalent à REQUIRE_PAYMENT_BEFORE_VALIDATION=true */
  MOBILE_MONEY_STUB_ENABLED: Env.schema.boolean.optional(),
  /** Secret HMAC pour `POST /api/v1/webhooks/mobile-money` (obligatoire si le gate paiement est actif). */
  PAYMENT_WEBHOOK_SECRET: Env.schema.string.optional(),
  /** true = autorise POST …/mobile-money/complete-local (développement seulement). */
  ALLOW_PAYMENT_COMPLETE_LOCAL: Env.schema.boolean.optional(),
  /** URL de base du PSP — appels HTTP sortants (optionnel). */
  MOBILE_MONEY_PSP_BASE_URL: Env.schema.string.optional(),
})
