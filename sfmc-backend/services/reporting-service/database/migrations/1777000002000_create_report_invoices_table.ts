import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'report_invoices'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)
      table.uuid('invoice_id').notNullable().unique()
      table.uuid('order_id').nullable()
      table.decimal('amount', 14, 2).notNullable().defaultTo(0)
      table.string('status').notNullable()
      table.timestamp('issued_at').notNullable().defaultTo(this.now())
      table.timestamp('created_at')
      table.timestamp('updated_at')
      table.index(['status'])
      table.index(['order_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
