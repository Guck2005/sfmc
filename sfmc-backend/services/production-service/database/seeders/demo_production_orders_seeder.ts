import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Machine from '#models/machine'
import ProductionOrder from '#models/production_order'

/**
 * Ordres de production fictifs liés aux commandes démo (`demo_orders_seeder`).
 * Exécuter après `machine_seeder` : `node ace db:seed --files=machine_seeder,demo_production_orders_seeder`
 */
const ORDER_VALIDATED = 'bbbbbbbb-bbbb-4bbb-bbbb-000000000002'
const ORDER_IN_PROD = 'bbbbbbbb-bbbb-4bbb-bbbb-000000000003'

export default class extends BaseSeeder {
  async run() {
    const machineCiment = await Machine.findByOrFail('name', 'LIGNE-CIMENT-01')
    const machineBriques = await Machine.findByOrFail('name', 'LIGNE-BRIQUES-01')

    await ProductionOrder.updateOrCreate(
      { id: 'dddddddd-dddd-4ddd-dddd-000000000001' },
      {
        id: 'dddddddd-dddd-4ddd-dddd-000000000001',
        productId: '11111111-1111-4111-a111-111111111102',
        quantity: 40,
        orderId: ORDER_VALIDATED,
        status: 'IN_PROGRESS',
        machineId: machineCiment.id,
      }
    )

    await ProductionOrder.updateOrCreate(
      { id: 'dddddddd-dddd-4ddd-dddd-000000000002' },
      {
        id: 'dddddddd-dddd-4ddd-dddd-000000000002',
        productId: '11111111-1111-4111-a111-111111111106',
        quantity: 500,
        orderId: ORDER_IN_PROD,
        status: 'QUALITY_CHECK',
        machineId: machineBriques.id,
      }
    )
  }
}
