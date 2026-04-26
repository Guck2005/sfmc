/**
 * `fr-FR` uses U+202F (narrow no-break space) as the thousands separator; PDFKit's
 * built-in Helvetica substitutes it poorly (often reads as "/" → "1/200" for 1200).
 */
export function formatPdfAmount(amount: number, currency: string): string {
  const n = Number(amount)
  const raw = n.toLocaleString('fr-FR', { minimumFractionDigits: 0 })
  const normalized = raw.replace(/\u202f|\u00a0/g, ' ')
  return `${normalized} ${currency}`
}
