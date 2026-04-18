import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'saga_log'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)
      table.string('saga_id', 128).notNullable()
      table.string('saga_type', 128).notNullable()
      table.string('step', 128).notNullable()
      table.enu('status', ['PENDING', 'COMPLETED', 'COMPENSATING', 'FAILED']).notNullable()
      table.json('payload').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['saga_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
