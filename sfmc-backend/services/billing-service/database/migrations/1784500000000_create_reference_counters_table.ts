import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'reference_counters'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('counter_key', 64).primary()
      table.bigInteger('last_number').notNullable().defaultTo(0)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
