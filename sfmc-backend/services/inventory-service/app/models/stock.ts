import { DateTime } from 'luxon'
import { BaseModel, column, computed } from '@adonisjs/lucid/orm'

export default class Stock extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare productId: string

  @column()
  declare warehouseId: string

  @column({ consume: (v) => Number(v) })
  declare quantity: number

  @column({ consume: (v) => Number(v) })
  declare reserved: number

  @column({ consume: (v) => Number(v) })
  declare threshold: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @computed()
  get available(): number {
    return Number(this.quantity) - Number(this.reserved)
  }

  @computed()
  get isCritical(): boolean {
    return this.available < Number(this.threshold)
  }
}
