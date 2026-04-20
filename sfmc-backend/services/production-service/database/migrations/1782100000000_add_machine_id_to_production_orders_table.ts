import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'production_orders'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('machine_id').nullable()
      table.index(['machine_id'], 'production_orders_machine_id_idx')
      table.index(['status'], 'production_orders_status_idx')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['machine_id'], 'production_orders_machine_id_idx')
      table.dropIndex(['status'], 'production_orders_status_idx')
      table.dropColumn('machine_id')
    })
  }
}
