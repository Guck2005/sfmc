import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'stocks'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('stock_type')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.enu('stock_type', ['RAW_MATERIAL', 'FINISHED_PRODUCT']).notNullable().defaultTo('FINISHED_PRODUCT')
    })
  }
}
