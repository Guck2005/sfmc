import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)
      table.string('email', 255).notNullable().unique()
      table.string('password', 255).notNullable()
      table.string('full_name', 255).nullable()
      table.enu('role', ['ADMIN', 'OPERATOR', 'CLIENT']).notNullable().defaultTo('CLIENT')
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
