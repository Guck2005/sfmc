import { BaseSchema } from '@adonisjs/lucid/schema'
import db from '@adonisjs/lucid/services/db'

export default class extends BaseSchema {
  protected tableName = 'invoices'

  async up() {
    await db.rawQuery(`
      UPDATE invoices
      SET invoice_number = 'FAC-MIG-' || REPLACE(id::text, '-', '')
      WHERE invoice_number IS NULL
    `)
    await db.rawQuery(`ALTER TABLE invoices ALTER COLUMN invoice_number SET NOT NULL`)
    await db.rawQuery(
      `CREATE UNIQUE INDEX IF NOT EXISTS invoices_invoice_number_unique ON invoices (invoice_number)`
    )
  }

  async down() {
    await db.rawQuery(`DROP INDEX IF EXISTS invoices_invoice_number_unique`)
    this.schema.alterTable(this.tableName, (table) => {
      table.string('invoice_number', 48).nullable().alter()
    })
  }
}
