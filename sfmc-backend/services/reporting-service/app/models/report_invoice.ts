import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class ReportInvoice extends BaseModel {
  public static table = 'report_invoices'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare invoiceId: string

  @column()
  declare orderId: string | null

  @column()
  declare amount: number

  @column()
  declare status: string

  @column.dateTime()
  declare issuedAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
