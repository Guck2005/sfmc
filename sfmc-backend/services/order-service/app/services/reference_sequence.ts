import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export function formatOrderPublicNumber(year: number, seq: number): string {
  return `CMD-${year}-${String(seq).padStart(6, '0')}`
}

function counterKey(scope: 'orders', year: number): string {
  return `${scope}:${year}`
}

/**
 * Incrémente et retourne le prochain numéro séquentiel pour l’année civile (UPSERT PostgreSQL).
 */
export async function nextOrderSequence(
  trx: TransactionClientContract,
  year: number
): Promise<number> {
  const key = counterKey('orders', year)
  const result = await trx.rawQuery(
    `INSERT INTO reference_counters (counter_key, last_number) VALUES (?, 1)
     ON CONFLICT (counter_key)
     DO UPDATE SET last_number = reference_counters.last_number + 1
     RETURNING last_number`,
    [key]
  )
  const row = result.rows[0] as { last_number: string | number }
  return Number(row.last_number)
}

export function currentYearFromDb(): number {
  return DateTime.utc().year
}
