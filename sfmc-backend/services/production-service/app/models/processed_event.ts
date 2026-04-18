import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class ProcessedEvent extends BaseModel {
  @column({ isPrimary: true })
  declare eventId: string

  @column()
  declare eventType: string

  @column.dateTime({ autoCreate: true })
  declare processedAt: DateTime
}