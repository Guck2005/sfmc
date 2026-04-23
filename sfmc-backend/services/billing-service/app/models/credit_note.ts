import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Invoice from '#models/invoice'

export default class CreditNote extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare invoiceId: string

  @column()
  declare orderId: string

  @column()
  declare customerId: string | null

  @column()
  declare amount: number

  @column()
  declare currency: string

  @column()
  declare reason: string | null

  @belongsTo(() => Invoice)
  declare invoice: BelongsTo<typeof Invoice>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
