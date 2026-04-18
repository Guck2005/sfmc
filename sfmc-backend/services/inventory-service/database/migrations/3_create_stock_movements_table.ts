import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'stock_movements'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)
      table.uuid('stock_id').references('stocks.id').onDelete('CASCADE').notNullable()
      table.enu('type', ['IN', 'OUT', 'ADJUSTMENT']).notNullable()
      table.decimal('quantity', 12, 3).notNullable()
      table.string('origin', 255).notNullable()
      table.uuid('reference_id').nullable()
      table.timestamp('date').notNullable()
      table.uuid('created_by').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['stock_id', 'date'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
