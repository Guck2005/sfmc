import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class ProcessedEvent extends BaseModel {
  public static table = 'processed_events'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare eventId: string

  @column()
  declare eventType: string | null

  @column.dateTime()
  declare processedAt: DateTime
}
