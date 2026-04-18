import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class ProductionOrder extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare productId: string

  @column()
  declare quantity: number

  @column()
  declare orderId: string

  @column()
  declare status: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}