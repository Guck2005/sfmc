import { BaseSchema } from '@adonisjs/lucid/schema'
import db from '@adonisjs/lucid/services/db'

export default class extends BaseSchema {
  protected tableName = 'orders'

  async up() {
    await db.rawQuery(`
      UPDATE orders
      SET order_number = 'CMD-MIG-' || REPLACE(id::text, '-', '')
      WHERE order_number IS NULL
    `)
    await db.rawQuery(`ALTER TABLE orders ALTER COLUMN order_number SET NOT NULL`)
    await db.rawQuery(
      `CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_unique ON orders (order_number)`
    )
  }

  async down() {
    await db.rawQuery(`DROP INDEX IF EXISTS orders_order_number_unique`)
    this.schema.alterTable(this.tableName, (table) => {
      table.string('order_number', 48).nullable().alter()
    })
  }
}
