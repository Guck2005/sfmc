import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'invoices'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)
      table.uuid('order_id').notNullable().unique()
      table.uuid('customer_id').nullable()
      table.decimal('amount', 12, 2).notNullable()
      table.string('currency', 5).notNullable().defaultTo('XOF')
      table.string('status').notNullable().defaultTo('PENDING') // PENDING, PAID, CANCELLED
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}