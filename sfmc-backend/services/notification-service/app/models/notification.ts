import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Notification extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare recipient: string

  @column()
  declare type: string

  @column()
  declare channel: string

  @column()
  declare status: string

  @column()
  declare payload: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}