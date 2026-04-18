import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'stocks'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)
      table.uuid('product_id').notNullable()
      table.uuid('warehouse_id').references('warehouses.id').onDelete('CASCADE').notNullable()
      table.enu('stock_type', ['RAW_MATERIAL', 'FINISHED_PRODUCT']).notNullable()
      table.decimal('quantity', 12, 3).notNullable().defaultTo(0)
      table.decimal('reserved', 12, 3).notNullable().defaultTo(0)
      table.decimal('threshold', 12, 3).notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.unique(['product_id', 'warehouse_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
