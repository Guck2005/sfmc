import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type MachineStatus = 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE'
export type MachineCategory = 'CIMENT' | 'FER' | 'BRIQUES' | 'GRANULATS'

export default class Machine extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @column()
  declare status: MachineStatus

  @column()
  declare category: MachineCategory | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
