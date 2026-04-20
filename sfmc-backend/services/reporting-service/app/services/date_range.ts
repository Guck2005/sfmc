import { DateTime } from 'luxon'

export interface DateRange {
  from?: DateTime
  to?: DateTime
}

/**
 * Parse `from` / `to` strings (ISO 8601 or YYYY-MM-DD) into Luxon DateTime.
 * Invalid values are silently dropped so the report simply returns the full
 * dataset — never fails the query because of a malformed filter.
 */
export function parseDateRange(raw: {
  from?: string | null
  to?: string | null
}): DateRange {
  const range: DateRange = {}
  if (raw.from) {
    const parsed = toDate(raw.from)
    if (parsed) range.from = parsed.startOf('day')
  }
  if (raw.to) {
    const parsed = toDate(raw.to)
    if (parsed) range.to = parsed.endOf('day')
  }
  return range
}

function toDate(value: string): DateTime | null {
  const iso = DateTime.fromISO(value, { zone: 'utc' })
  if (iso.isValid) return iso
  const sql = DateTime.fromSQL(value, { zone: 'utc' })
  if (sql.isValid) return sql
  return null
}

/**
 * Apply the range to a Knex/Lucid query builder on a given column (default:
 * `created_at`). Returns the same builder so calls can be chained.
 */
export function applyDateRange<T extends { where: Function }>(
  query: T,
  range: DateRange,
  column: string = 'created_at'
): T {
  if (range.from) (query as any).where(column, '>=', range.from.toSQL())
  if (range.to) (query as any).where(column, '<=', range.to.toSQL())
  return query
}

/**
 * Human readable label for the period (used in CSV headers / filenames).
 * Example: `2026-04-01_2026-04-20` or `all-time`.
 */
export function rangeLabel(range: DateRange): string {
  const f = range.from?.toISODate()
  const t = range.to?.toISODate()
  if (f && t) return `${f}_${t}`
  if (f) return `from-${f}`
  if (t) return `until-${t}`
  return 'all-time'
}
