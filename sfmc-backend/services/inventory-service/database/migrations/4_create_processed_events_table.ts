import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'processed_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)
      table.string('event_id', 255).notNullable().unique()
      table.string('event_type', 128).nullable()
      table.timestamp('processed_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
