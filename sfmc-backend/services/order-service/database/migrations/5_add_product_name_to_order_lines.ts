import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'order_lines'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('product_name', 512).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('product_name')
    })
  }
}
