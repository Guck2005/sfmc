import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class ReportProductionOrder extends BaseModel {
  public static table = 'report_production_orders'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare productionOrderId: string

  @column()
  declare productId: string

  @column()
  declare status: string

  @column()
  declare qualityPassed: boolean | null

  @column.dateTime()
  declare startedAt: DateTime | null

  @column.dateTime()
  declare completedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
