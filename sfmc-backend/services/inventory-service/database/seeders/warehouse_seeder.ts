import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Warehouse from '#models/warehouse'
import Stock from '#models/stock'
import db from '@adonisjs/lucid/services/db'

export default class extends BaseSeeder {
  async run() {
    // Ensure gen_random_uuid exists
    await db.rawQuery('CREATE EXTENSION IF NOT EXISTS pgcrypto').catch(() => {})

    // Warehouses
    const cotonouMain = await Warehouse.firstOrCreate(
      { name: 'Entrepôt Cotonou Principal' },
      {
        name: 'Entrepôt Cotonou Principal',
        location: 'Cotonou, Akpakpa',
        capacity: 100000,
      }
    )
    const cotonouSecondary = await Warehouse.firstOrCreate(
      { name: 'Entrepôt Cotonou Secondaire' },
      {
        name: 'Entrepôt Cotonou Secondaire',
        location: 'Cotonou, Godomey',
        capacity: 50000,
      }
    )

    // Products are managed by product-service; we only seed stocks keyed by product IDs
    // retrieved through RabbitMQ or admin injection. For the demo, we pick ten static
    // product UUIDs generated deterministically — operators will re-link via product IDs
    // once the product-service syncs. These UUIDs are stable across re-seeds.
    const productIds = [
      '11111111-1111-4111-a111-111111111101', // ciment CEM I
      '11111111-1111-4111-a111-111111111102', // ciment CEM II
      '11111111-1111-4111-a111-111111111103', // fer HA 10
      '11111111-1111-4111-a111-111111111104', // fer HA 12
      '11111111-1111-4111-a111-111111111105', // fer HA 16
      '11111111-1111-4111-a111-111111111106', // brique pleine
      '11111111-1111-4111-a111-111111111107', // brique creuse
      '11111111-1111-4111-a111-111111111108', // granulats 0/31.5
      '11111111-1111-4111-a111-111111111109', // sable fin
      '11111111-1111-4111-a111-111111111110', // gravier 10/25
    ]

    // 5 first → RAW_MATERIAL, 5 last → FINISHED_PRODUCT. Both warehouses.
    for (let i = 0; i < productIds.length; i++) {
      const productId = productIds[i]
      const stockType = i < 5 ? 'RAW_MATERIAL' : 'FINISHED_PRODUCT'
      for (const warehouse of [cotonouMain, cotonouSecondary]) {
        await Stock.updateOrCreate(
          { productId, warehouseId: warehouse.id },
          {
            productId,
            warehouseId: warehouse.id,
            stockType,
            quantity: stockType === 'RAW_MATERIAL' ? 500 : 200,
            reserved: 0,
            threshold: stockType === 'RAW_MATERIAL' ? 100 : 50,
          }
        )
      }
    }
  }
}
