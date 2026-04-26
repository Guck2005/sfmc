import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'orders'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('payment_status', 40).nullable()
      table.string('mobile_money_phone', 32).nullable()
      table.string('mobile_money_provider_ref', 128).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('payment_status')
      table.dropColumn('mobile_money_phone')
      table.dropColumn('mobile_money_provider_ref')
    })
  }
}
