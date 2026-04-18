import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'payments'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)
      table.uuid('invoice_id').notNullable().references('id').inTable('invoices').onDelete('CASCADE')
      table.decimal('amount', 12, 2).notNullable()
      table.string('method').notNullable().defaultTo('CASH') // CASH, MOBILE_MONEY, BANK_TRANSFER
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}