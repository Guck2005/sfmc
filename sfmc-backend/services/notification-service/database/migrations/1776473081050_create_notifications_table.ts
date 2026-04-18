import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'notifications'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)
      table.string('recipient').notNullable()       // email or phone number
      table.string('type').notNullable()             // e.g. ORDER_VALIDATED, STOCK_ALERT, etc.
      table.string('channel').notNullable()           // EMAIL or SMS
      table.string('status').notNullable().defaultTo('SENT') // SENT, FAILED
      table.text('payload').nullable()                // JSON stringified data
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}