import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import ReportOrder from '#models/report_order'
import ReportInvoice from '#models/report_invoice'

const CLIENT_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-000000000003'

/**
 * Projections matérialisées pour le dashboard (données fictives cohérentes avec order/billing seeders).
 */
export default class extends BaseSeeder {
  async run() {
    const orders: Array<{
      id: string
      orderId: string
      status: string
      totalAmount: number
    }> = [
      {
        id: 'ffffffff-ffff-4fff-ffff-000000000001',
        orderId: 'bbbbbbbb-bbbb-4bbb-bbbb-000000000001',
        status: 'DELIVERED',
        totalAmount: 20 * 5500,
      },
      {
        id: 'ffffffff-ffff-4fff-ffff-000000000002',
        orderId: 'bbbbbbbb-bbbb-4bbb-bbbb-000000000002',
        status: 'VALIDATED',
        totalAmount: 40 * 4800 + 25 * 3200,
      },
      {
        id: 'ffffffff-ffff-4fff-ffff-000000000003',
        orderId: 'bbbbbbbb-bbbb-4bbb-bbbb-000000000003',
        status: 'IN_PRODUCTION',
        totalAmount: 500 * 120,
      },
      {
        id: 'ffffffff-ffff-4fff-ffff-000000000004',
        orderId: 'bbbbbbbb-bbbb-4bbb-bbbb-000000000004',
        status: 'PENDING',
        totalAmount: 5 * 5500,
      },
    ]

    for (const o of orders) {
      await ReportOrder.updateOrCreate(
        { id: o.id },
        {
          id: o.id,
          orderId: o.orderId,
          customerId: CLIENT_ID,
          status: o.status,
          totalAmount: o.totalAmount,
        }
      )
    }

    const now = DateTime.now()
    await ReportInvoice.updateOrCreate(
      { id: 'ffffffff-ffff-4fff-ffff-000000010001' },
      {
        id: 'ffffffff-ffff-4fff-ffff-000000010001',
        invoiceId: 'cccccccc-cccc-4ccc-cccc-000000000001',
        orderId: 'bbbbbbbb-bbbb-4bbb-bbbb-000000000001',
        amount: 20 * 5500,
        status: 'PAID',
        issuedAt: now,
      }
    )
    await ReportInvoice.updateOrCreate(
      { id: 'ffffffff-ffff-4fff-ffff-000000010002' },
      {
        id: 'ffffffff-ffff-4fff-ffff-000000010002',
        invoiceId: 'cccccccc-cccc-4ccc-cccc-000000000002',
        orderId: 'bbbbbbbb-bbbb-4bbb-bbbb-000000000002',
        amount: 40 * 4800 + 25 * 3200,
        status: 'PENDING',
        issuedAt: now,
      }
    )
  }
}
