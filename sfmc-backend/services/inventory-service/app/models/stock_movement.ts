import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type MovementType = 'IN' | 'OUT' | 'ADJUSTMENT'

export default class StockMovement extends BaseModel {
  public static table = 'stock_movements'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare stockId: string

  @column()
  declare type: MovementType

  @column({ consume: (v) => Number(v) })
  declare quantity: number

  @column()
  declare origin: string

  @column()
  declare referenceId: string | null

  @column.dateTime()
  declare date: DateTime

  @column()
  declare createdBy: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
