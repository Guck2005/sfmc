import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class ReportStockSnapshot extends BaseModel {
  public static table = 'report_stock_snapshots'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare productId: string

  @column()
  declare warehouseId: string | null

  @column()
  declare quantity: number

  @column()
  declare reserved: number

  @column()
  declare threshold: number

  @column()
  declare isCritical: boolean

  @column.dateTime()
  declare snapshotAt: DateTime
}
