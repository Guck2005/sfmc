import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class OrderLine extends BaseModel {
  public static table = 'order_lines'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare orderId: string

  @column()
  declare productId: string

  /** Libellé catalogue figé au moment de la commande */
  @column()
  declare productName: string | null

  @column({ consume: (v) => Number(v) })
  declare quantity: number

  @column({ consume: (v) => Number(v) })
  declare unitPrice: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
