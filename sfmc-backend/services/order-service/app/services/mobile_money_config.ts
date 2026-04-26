import env from '#start/env'

/**
 * Après `inventory.reserved`, la commande attend une confirmation de paiement
 * avant `order.validated` (flux mobile money / webhook).
 */
export function isPaymentGateEnabled(): boolean {
  if (env.get('REQUIRE_PAYMENT_BEFORE_VALIDATION') === true) return true
  /** @deprecated utiliser REQUIRE_PAYMENT_BEFORE_VALIDATION */
  if (env.get('MOBILE_MONEY_STUB_ENABLED') === true) return true
  return false
}

/** @deprecated alias de isPaymentGateEnabled */
export function isMobileMoneyStubEnabled(): boolean {
  return isPaymentGateEnabled()
}

/** Secret partagé avec le PSP pour authentifier les webhooks (HMAC-SHA256). */
export function paymentWebhookSecret(): string | null {
  const s = env.get('PAYMENT_WEBHOOK_SECRET')
  if (typeof s === 'string' && s.trim().length > 0) return s.trim()
  return null
}

/** Autorise POST …/mobile-money/complete-local (contournement dev uniquement). */
export function allowPaymentCompleteLocal(): boolean {
  return env.get('ALLOW_PAYMENT_COMPLETE_LOCAL') === true
}

/** URL de base du PSP — appels sortants lorsque l’intégration HTTP sera branchée. */
export function mobileMoneyPspBaseUrl(): string | null {
  const u = env.get('MOBILE_MONEY_PSP_BASE_URL')
  if (typeof u === 'string' && u.trim().length > 0) return u.trim()
  return null
}
