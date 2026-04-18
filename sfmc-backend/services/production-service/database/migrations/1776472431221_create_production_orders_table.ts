import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'production_orders'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)
      table.uuid('product_id').notNullable()
      table.integer('quantity').notNullable()
      table.uuid('order_id').notNullable()
      table.string('status').notNullable().defaultTo('PLANNED') // PLANNED, IN_PROGRESS, QUALITY_CHECK, COMPLETED, REJECTED, CANCELLED
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}