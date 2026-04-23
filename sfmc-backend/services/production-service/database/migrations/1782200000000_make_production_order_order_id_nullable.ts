import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'production_orders'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('order_id').nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('order_id').notNullable().alter()
    })
  }
}
