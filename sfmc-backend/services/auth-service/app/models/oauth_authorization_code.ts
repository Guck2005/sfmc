import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class OauthAuthorizationCode extends BaseModel {
  public static table = 'oauth_authorization_codes'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare code: string

  @column()
  declare clientId: string

  @column()
  declare redirectUri: string

  @column()
  declare userId: string

  @column()
  declare scope: string | null

  @column.dateTime()
  declare expiresAt: DateTime

  @column()
  declare used: boolean

  @column.dateTime()
  declare usedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  get isExpired(): boolean {
    return DateTime.now() > this.expiresAt
  }
}
