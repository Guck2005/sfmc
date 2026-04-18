import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'report_stock_snapshots'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)
      table.uuid('product_id').notNullable()
      table.uuid('warehouse_id').nullable()
      table.integer('quantity').notNullable().defaultTo(0)
      table.integer('reserved').notNullable().defaultTo(0)
      table.integer('threshold').notNullable().defaultTo(0)
      table.boolean('is_critical').notNullable().defaultTo(false)
      table.timestamp('snapshot_at').notNullable().defaultTo(this.now())
      table.index(['product_id'])
      table.index(['is_critical'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
