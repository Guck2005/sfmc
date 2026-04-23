import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type ProductionOrderStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'QUALITY_CHECK'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'

export const TERMINAL_PRODUCTION_STATUSES: ProductionOrderStatus[] = [
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
]

export default class ProductionOrder extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare productId: string

  @column()
  declare quantity: number

  @column()
  declare orderId: string | null

  @column()
  declare status: ProductionOrderStatus

  @column()
  declare machineId: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}