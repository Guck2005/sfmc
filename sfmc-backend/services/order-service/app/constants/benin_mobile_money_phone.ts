/**
 * Numéro mobile money Bénin : +229, puis 01, puis exactement 8 chiffres.
 * Un seul « + » en tête ; après +22901, uniquement des chiffres.
 */
export const BENIN_MOBILE_MONEY_REGEX = /^\+22901\d{8}$/

export function isBeninMobileMoneyPhone(value: string | null | undefined): boolean {
  if (value == null) return false
  const t = String(value).trim()
  if (t.length === 0) return false
  return BENIN_MOBILE_MONEY_REGEX.test(t)
}
