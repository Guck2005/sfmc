import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export function formatInvoicePublicNumber(year: number, seq: number): string {
  return `FAC-${year}-${String(seq).padStart(6, '0')}`
}

function counterKey(scope: 'invoices', year: number): string {
  return `${scope}:${year}`
}

export async function nextInvoiceSequence(
  trx: TransactionClientContract,
  year: number
): Promise<number> {
  const key = counterKey('invoices', year)
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

export function currentInvoiceYear(): number {
  return DateTime.utc().year
}
