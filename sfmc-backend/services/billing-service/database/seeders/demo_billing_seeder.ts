import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import Invoice from '#models/invoice'
import Payment from '#models/payment'

const CLIENT_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-000000000003'

/** Montants alignés sur demo_orders_seeder */
const ORDER_AMOUNTS: Record<string, number> = {
  'bbbbbbbb-bbbb-4bbb-bbbb-000000000001': 20 * 5500,
  'bbbbbbbb-bbbb-4bbb-bbbb-000000000002': 40 * 4800 + 25 * 3200,
}

export default class extends BaseSeeder {
  async run() {
    await db.transaction(async (trx) => {
      const invIds = ['cccccccc-cccc-4ccc-cccc-000000000001', 'cccccccc-cccc-4ccc-cccc-000000000002']
      await Payment.query({ client: trx }).whereIn('invoiceId', invIds).delete()
      await Invoice.query({ client: trx }).whereIn('id', invIds).delete()

      const inv1 = await Invoice.create(
        {
          id: invIds[0],
          orderId: 'bbbbbbbb-bbbb-4bbb-bbbb-000000000001',
          orderPublicNumber: 'CMD-DEMO-000001',
          invoiceNumber: 'FAC-DEMO-000001',
          customerId: CLIENT_ID,
          amount: ORDER_AMOUNTS['bbbbbbbb-bbbb-4bbb-bbbb-000000000001'],
          currency: 'XOF',
          status: 'PAID',
        },
        { client: trx }
      )

      await Payment.create(
        {
          id: 'cccccccc-cccc-4ccc-cccc-000000001001',
          invoiceId: inv1.id,
          amount: inv1.amount,
          method: 'MOBILE_MONEY',
        },
        { client: trx }
      )

      await Invoice.create(
        {
          id: invIds[1],
          orderId: 'bbbbbbbb-bbbb-4bbb-bbbb-000000000002',
          orderPublicNumber: 'CMD-DEMO-000002',
          invoiceNumber: 'FAC-DEMO-000002',
          customerId: CLIENT_ID,
          amount: ORDER_AMOUNTS['bbbbbbbb-bbbb-4bbb-bbbb-000000000002'],
          currency: 'XOF',
          status: 'PENDING',
        },
        { client: trx }
      )
    })
  }
}
