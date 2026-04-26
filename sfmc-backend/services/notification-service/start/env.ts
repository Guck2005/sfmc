/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
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
  /** Base URL billing-service (PDF factures / avoirs pour pièces jointes e-mail). */
  BILLING_SERVICE_URL: Env.schema.string.optional(),
  RABBITMQ_URL: Env.schema.string(),
  BREVO_SMTP_HOST: Env.schema.string(),
  BREVO_SMTP_PORT: Env.schema.number(),
  BREVO_SMTP_USER: Env.schema.string(),
  BREVO_SMTP_PASSWORD: Env.schema.string(),
  BREVO_SENDER_EMAIL: Env.schema.string(),
  BREVO_SENDER_NAME: Env.schema.string(),
  BREVO_API_KEY: Env.schema.string.optional(),
  BREVO_SMS_SENDER: Env.schema.string.optional(),
  LOGISTICS_EMAIL: Env.schema.string.optional(),
  PRODUCTION_EMAIL: Env.schema.string.optional(),
  FINANCE_EMAIL: Env.schema.string.optional(),
  ADMIN_FALLBACK_EMAIL: Env.schema.string.optional(),
})

