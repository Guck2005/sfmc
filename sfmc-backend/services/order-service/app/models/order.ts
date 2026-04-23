import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import OrderLine from '#models/order_line'

export type OrderStatus =
  | 'PENDING'
  | 'VALIDATED'
  | 'IN_PRODUCTION'
  | 'READY'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'

export default class Order extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  /** Référence affichable (ex. CMD-2026-000001) — distincte de l’UUID `id`. */
  @column({ columnName: 'order_number' })
  declare orderNumber: string

  @column()
  declare customerId: string

  @column()
  declare status: OrderStatus

  @column()
  declare sagaStatus: string | null

  @column({ consume: (v) => Number(v) })
  declare totalAmount: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => OrderLine)
  declare lines: HasMany<typeof OrderLine>
}
