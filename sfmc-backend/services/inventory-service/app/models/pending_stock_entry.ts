import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type PendingStockEntryStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED'

export default class PendingStockEntry extends BaseModel {
  static table = 'pending_stock_entries'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare productionOrderId: string

  @column()
  declare productId: string

  @column({ consume: (v) => Number(v) })
  declare quantity: number

  @column()
  declare status: PendingStockEntryStatus

  @column()
  declare warehouseId: string | null

  @column({ consume: (v) => (v == null ? null : Number(v)) })
  declare confirmedQuantity: number | null

  @column()
  declare confirmedByUserId: string | null

  @column.dateTime()
  declare confirmedAt: DateTime | null

  @column()
  declare sourceEventId: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
