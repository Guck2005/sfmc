import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type ProductCategory = 'CIMENT' | 'FER' | 'BRIQUES' | 'GRANULATS'

export default class Product extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @column()
  declare category: ProductCategory

  @column()
  declare unit: string

  @column()
  declare description: string | null

  /** URL absolue (CDN, stockage objet, etc.) — pas de fichier binaire en base. */
  @column()
  declare imageUrl: string | null

  @column()
  declare unitPrice: number

  @column()
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
