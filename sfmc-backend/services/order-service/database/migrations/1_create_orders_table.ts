import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'orders'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)
      table.uuid('customer_id').notNullable()
      table
        .enu('status', [
          'PENDING',
          'VALIDATED',
          'IN_PRODUCTION',
          'READY',
          'SHIPPED',
          'DELIVERED',
          'CANCELLED',
        ])
        .notNullable()
        .defaultTo('PENDING')
      table.string('saga_status', 64).nullable()
      table.decimal('total_amount', 12, 2).notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['customer_id'])
      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
