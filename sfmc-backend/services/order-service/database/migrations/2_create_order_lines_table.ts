import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'order_lines'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)
      table.uuid('order_id').references('orders.id').onDelete('CASCADE').notNullable()
      table.uuid('product_id').notNullable()
      table.decimal('quantity', 12, 3).notNullable()
      table.decimal('unit_price', 12, 2).notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['order_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
