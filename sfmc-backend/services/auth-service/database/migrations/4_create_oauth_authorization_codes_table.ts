import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'oauth_authorization_codes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)
      table.string('code', 255).notNullable().unique()
      table.string('client_id', 255).notNullable()
      table.string('redirect_uri', 1024).notNullable()
      table.uuid('user_id').notNullable()
      table.string('scope', 512).nullable()
      table.timestamp('expires_at', { useTz: true }).notNullable()
      table.boolean('used').notNullable().defaultTo(false)
      table.timestamp('used_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.index(['code'])
      table.index(['client_id', 'used'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
