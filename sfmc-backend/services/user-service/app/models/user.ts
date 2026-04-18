import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type UserRole = 'ADMIN' | 'OPERATOR' | 'CLIENT'

export default class User extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare firstName: string

  @column()
  declare lastName: string

  @column()
  declare email: string

  @column()
  declare phone: string | null

  @column()
  declare role: UserRole

  @column()
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`
  }
}
