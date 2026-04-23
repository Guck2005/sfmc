import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pending_stock_entries'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)
      table.uuid('production_order_id').notNullable()
      table.uuid('product_id').notNullable()
      table.decimal('quantity', 12, 3).notNullable()
      table.string('status', 24).notNullable().defaultTo('PENDING')
      table.uuid('warehouse_id').nullable().references('warehouses.id').onDelete('SET NULL')
      table.decimal('confirmed_quantity', 12, 3).nullable()
      table.uuid('confirmed_by_user_id').nullable()
      table.timestamp('confirmed_at').nullable()
      table.uuid('source_event_id').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['status', 'created_at'])
      table.index(['production_order_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
