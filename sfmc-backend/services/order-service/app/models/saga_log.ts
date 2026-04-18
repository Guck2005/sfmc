import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type SagaStatus = 'PENDING' | 'COMPLETED' | 'COMPENSATING' | 'FAILED'

export default class SagaLog extends BaseModel {
  public static table = 'saga_log'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare sagaId: string

  @column()
  declare sagaType: string

  @column()
  declare step: string

  @column()
  declare status: SagaStatus

  @column({
    prepare: (value: unknown) =>
      value === null || value === undefined ? null : JSON.stringify(value),
    consume: (value: unknown) => {
      if (value === null || value === undefined) return null
      if (typeof value === 'string') {
        try {
          return JSON.parse(value)
        } catch {
          return value
        }
      }
      return value
    },
  })
  declare payload: Record<string, unknown> | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
