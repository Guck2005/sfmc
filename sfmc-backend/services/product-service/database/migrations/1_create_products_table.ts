import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'products'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)
      table.string('name', 255).notNullable()
      table
        .enu('category', ['CIMENT', 'FER', 'BRIQUES', 'GRANULATS'])
        .notNullable()
      table.string('unit', 50).notNullable()
      table.text('description').nullable()
      table.decimal('unit_price', 12, 2).notNullable().defaultTo(0)
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
