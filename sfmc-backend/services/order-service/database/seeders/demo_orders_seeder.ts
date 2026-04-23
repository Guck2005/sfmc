import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import Order, { type OrderStatus } from '#models/order'
import OrderLine from '#models/order_line'

/**
 * Données de démo uniquement (fictives).
 * Aligné sur auth/user `aaaaaaaa-…-000000000003` (client) et product_seeder `11111111-…`.
 */
const CLIENT_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-000000000003'

const P = {
  cimentI: '11111111-1111-4111-a111-111111111101',
  cimentII: '11111111-1111-4111-a111-111111111102',
  fer10: '11111111-1111-4111-a111-111111111103',
  briquePleine: '11111111-1111-4111-a111-111111111106',
} as const

const DEMO_ORDER_IDS = [
  'bbbbbbbb-bbbb-4bbb-bbbb-000000000001',
  'bbbbbbbb-bbbb-4bbb-bbbb-000000000002',
  'bbbbbbbb-bbbb-4bbb-bbbb-000000000003',
  'bbbbbbbb-bbbb-4bbb-bbbb-000000000004',
] as const

export default class extends BaseSeeder {
  async run() {
    await db.transaction(async (trx) => {
      await OrderLine.query({ client: trx }).whereIn('orderId', [...DEMO_ORDER_IDS]).delete()
      await Order.query({ client: trx }).whereIn('id', [...DEMO_ORDER_IDS]).delete()

      const orders: Array<{
        id: string
        orderNumber: string
        status: OrderStatus
        sagaStatus: string | null
        lines: Array<{
          id: string
          productId: string
          productName: string
          quantity: number
          unitPrice: number
        }>
      }> = [
        {
          id: 'bbbbbbbb-bbbb-4bbb-bbbb-000000000001',
          orderNumber: 'CMD-DEMO-000001',
          status: 'DELIVERED',
          sagaStatus: 'COMPLETED',
          lines: [
            {
              id: 'bbbbbbbb-bbbb-4bbb-bbbb-000000001001',
              productId: P.cimentI,
              productName: 'Ciment Portland CEM I 42.5',
              quantity: 20,
              unitPrice: 5500,
            },
          ],
        },
        {
          id: 'bbbbbbbb-bbbb-4bbb-bbbb-000000000002',
          orderNumber: 'CMD-DEMO-000002',
          status: 'VALIDATED',
          sagaStatus: 'COMPLETED',
          lines: [
            {
              id: 'bbbbbbbb-bbbb-4bbb-bbbb-000000002001',
              productId: P.cimentII,
              productName: 'Ciment Portland CEM II 32.5',
              quantity: 40,
              unitPrice: 4800,
            },
            {
              id: 'bbbbbbbb-bbbb-4bbb-bbbb-000000002002',
              productId: P.fer10,
              productName: 'Fer à béton HA 10mm',
              quantity: 25,
              unitPrice: 3200,
            },
          ],
        },
        {
          id: 'bbbbbbbb-bbbb-4bbb-bbbb-000000000003',
          orderNumber: 'CMD-DEMO-000003',
          status: 'IN_PRODUCTION',
          sagaStatus: 'IN_PROGRESS',
          lines: [
            {
              id: 'bbbbbbbb-bbbb-4bbb-bbbb-000000003001',
              productId: P.briquePleine,
              productName: 'Brique pleine 20x10x5',
              quantity: 500,
              unitPrice: 120,
            },
          ],
        },
        {
          id: 'bbbbbbbb-bbbb-4bbb-bbbb-000000000004',
          orderNumber: 'CMD-DEMO-000004',
          status: 'PENDING',
          sagaStatus: null,
          lines: [
            {
              id: 'bbbbbbbb-bbbb-4bbb-bbbb-000000004001',
              productId: P.cimentI,
              productName: 'Ciment Portland CEM I 42.5',
              quantity: 5,
              unitPrice: 5500,
            },
          ],
        },
      ]

      for (const spec of orders) {
        const total = spec.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
        await Order.create(
          {
            id: spec.id,
            orderNumber: spec.orderNumber,
            customerId: CLIENT_ID,
            status: spec.status,
            sagaStatus: spec.sagaStatus,
            totalAmount: total,
          },
          { client: trx }
        )
        for (const line of spec.lines) {
          await OrderLine.create(
            {
              id: line.id,
              orderId: spec.id,
              productId: line.productId,
              productName: line.productName,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
            },
            { client: trx }
          )
        }
      }
    })
  }
}
