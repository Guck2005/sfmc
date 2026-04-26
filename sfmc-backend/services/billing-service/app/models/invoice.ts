import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import Payment from '#models/payment'

export default class Invoice extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare orderId: string

  /** Référence commande affichable (copie depuis order.validated). */
  @column({ columnName: 'order_public_number' })
  declare orderPublicNumber: string | null

  @column({ columnName: 'invoice_number' })
  declare invoiceNumber: string

  @column()
  declare customerId: string | null

  /** E-mail client (copie depuis `order.validated`) pour notifications facture. */
  @column({ columnName: 'customer_email' })
  declare customerEmail: string | null

  @column()
  declare amount: number

  @column()
  declare currency: string

  @column()
  declare status: string

  @hasMany(() => Payment)
  declare payments: HasMany<typeof Payment>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}