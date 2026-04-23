import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import Warehouse from '#models/warehouse'
import Stock from '#models/stock'
import StockMovement, { type MovementType } from '#models/stock_movement'
import db from '@adonisjs/lucid/services/db'
import type { StockType } from '#models/stock'

/** Même UUIDs que `product-service/database/seeders/product_seeder.ts`. */
const DEMO_PRODUCT_IDS = [
  '11111111-1111-4111-a111-111111111101',
  '11111111-1111-4111-a111-111111111102',
  '11111111-1111-4111-a111-111111111103',
  '11111111-1111-4111-a111-111111111104',
  '11111111-1111-4111-a111-111111111105',
  '11111111-1111-4111-a111-111111111106',
  '11111111-1111-4111-a111-111111111107',
  '11111111-1111-4111-a111-111111111108',
  '11111111-1111-4111-a111-111111111109',
  '11111111-1111-4111-a111-111111111110',
] as const

type WarehouseSide = 'hub' | 'platform'

type DemoLine = {
  productId: (typeof DEMO_PRODUCT_IDS)[number]
  stockType: StockType
  hub: { quantity: number; reserved: number; threshold: number }
  platform: { quantity: number; reserved: number; threshold: number }
}

/**
 * Chiffres fictifs mais cohérents avec les unités du catalogue :
 * - Hub Akpakpa = gros stock / flux camions
 * - Plateforme Godomey = relais plus petit
 * - Quelques réservations (commandes en cours) et une ligne « sous seuil » (sable à Godomey).
 */
const DEMO_STOCK_LINES: DemoLine[] = [
  {
    productId: '11111111-1111-4111-a111-111111111101',
    stockType: 'RAW_MATERIAL',
    hub: { quantity: 2480, reserved: 0, threshold: 420 },
    platform: { quantity: 520, reserved: 0, threshold: 140 },
  },
  {
    productId: '11111111-1111-4111-a111-111111111102',
    stockType: 'RAW_MATERIAL',
    hub: { quantity: 1820, reserved: 120, threshold: 360 },
    platform: { quantity: 380, reserved: 0, threshold: 100 },
  },
  {
    productId: '11111111-1111-4111-a111-111111111103',
    stockType: 'RAW_MATERIAL',
    hub: { quantity: 920, reserved: 180, threshold: 200 },
    platform: { quantity: 140, reserved: 24, threshold: 40 },
  },
  {
    productId: '11111111-1111-4111-a111-111111111104',
    stockType: 'RAW_MATERIAL',
    hub: { quantity: 640, reserved: 85, threshold: 140 },
    platform: { quantity: 95, reserved: 10, threshold: 35 },
  },
  {
    productId: '11111111-1111-4111-a111-111111111105',
    stockType: 'RAW_MATERIAL',
    hub: { quantity: 410, reserved: 0, threshold: 100 },
    platform: { quantity: 72, reserved: 0, threshold: 28 },
  },
  {
    productId: '11111111-1111-4111-a111-111111111106',
    stockType: 'FINISHED_PRODUCT',
    hub: { quantity: 15600, reserved: 2100, threshold: 2500 },
    platform: { quantity: 4200, reserved: 480, threshold: 800 },
  },
  {
    productId: '11111111-1111-4111-a111-111111111107',
    stockType: 'FINISHED_PRODUCT',
    hub: { quantity: 11100, reserved: 1450, threshold: 1800 },
    platform: { quantity: 3100, reserved: 360, threshold: 600 },
  },
  {
    productId: '11111111-1111-4111-a111-111111111108',
    stockType: 'RAW_MATERIAL',
    hub: { quantity: 186, reserved: 0, threshold: 32 },
    platform: { quantity: 48, reserved: 0, threshold: 14 },
  },
  {
    productId: '11111111-1111-4111-a111-111111111109',
    stockType: 'RAW_MATERIAL',
    hub: { quantity: 118, reserved: 22, threshold: 40 },
    // Disponible 26 < seuil 28 → alerte stock critique en démo
    platform: { quantity: 34, reserved: 8, threshold: 28 },
  },
  {
    productId: '11111111-1111-4111-a111-111111111110',
    stockType: 'RAW_MATERIAL',
    hub: { quantity: 132, reserved: 0, threshold: 30 },
    platform: { quantity: 41, reserved: 0, threshold: 14 },
  },
]

export default class extends BaseSeeder {
  async run() {
    await db.rawQuery('CREATE EXTENSION IF NOT EXISTS pgcrypto').catch(() => {})

    const cotonouMain = await Warehouse.firstOrCreate(
      { name: 'Hub logistique Cotonou — Akpakpa (démo)' },
      {
        name: 'Hub logistique Cotonou — Akpakpa (démo)',
        location: 'Cotonou, Akpakpa — zone matériaux (fictif)',
        capacity: 100000,
      }
    )
    const cotonouSecondary = await Warehouse.firstOrCreate(
      { name: 'Plateforme Cotonou — Godomey (démo)' },
      {
        name: 'Plateforme Cotonou — Godomey (démo)',
        location: 'Cotonou, Godomey — stock secondaire (fictif)',
        capacity: 50000,
      }
    )

    const bySide = (side: WarehouseSide) => (side === 'hub' ? cotonouMain : cotonouSecondary)

    for (const line of DEMO_STOCK_LINES) {
      for (const side of ['hub', 'platform'] as const) {
        const warehouse = bySide(side)
        const snap = side === 'hub' ? line.hub : line.platform
        await Stock.updateOrCreate(
          { productId: line.productId, warehouseId: warehouse.id },
          {
            productId: line.productId,
            warehouseId: warehouse.id,
            stockType: line.stockType,
            quantity: snap.quantity,
            reserved: snap.reserved,
            threshold: snap.threshold,
          }
        )
      }
    }

    await this.seedDemoMovements()
  }

  /**
   * Journal fictif pour alimenter l’écran « Mouvements » (ne recalcule pas les quantités :
   * les stocks sont figés ci-dessus pour une démo lisible).
   */
  private async seedDemoMovements() {
    const stocks = await Stock.query().whereIn('product_id', [...DEMO_PRODUCT_IDS])
    if (!stocks.length) return

    await StockMovement.query()
      .whereIn(
        'stock_id',
        stocks.map((s) => s.id)
      )
      .delete()

    const hub = await Warehouse.findByOrFail('name', 'Hub logistique Cotonou — Akpakpa (démo)')
    const platform = await Warehouse.findByOrFail('name', 'Plateforme Cotonou — Godomey (démo)')

    const stockId = (productId: string, warehouseId: string) =>
      stocks.find((s) => s.productId === productId && s.warehouseId === warehouseId)?.id

    const now = DateTime.now()
    type SampleMov = { type: MovementType; quantity: number; origin: string; daysAgo: number }
    const samples: Array<{
      productId: string
      warehouseId: string
      movements: SampleMov[]
    }> = [
      {
        productId: DEMO_PRODUCT_IDS[0],
        warehouseId: hub.id,
        movements: [
          { type: 'IN', quantity: 400, origin: 'Réception fournisseur — BL démo #2401', daysAgo: 6 },
          { type: 'OUT', quantity: 120, origin: 'Livraison chantier Cocotomey (démo)', daysAgo: 3 },
        ],
      },
      {
        productId: DEMO_PRODUCT_IDS[1],
        warehouseId: hub.id,
        movements: [
          { type: 'IN', quantity: 240, origin: 'Transfert depuis zone portuaire (démo)', daysAgo: 5 },
          { type: 'OUT', quantity: 60, origin: 'Sortie interne vers Godomey (démo)', daysAgo: 1 },
        ],
      },
      {
        productId: DEMO_PRODUCT_IDS[5],
        warehouseId: hub.id,
        movements: [
          { type: 'IN', quantity: 3200, origin: 'Fin de ligne production — lot démo B12', daysAgo: 4 },
          { type: 'OUT', quantity: 800, origin: 'Expédition gros client (démo)', daysAgo: 2 },
        ],
      },
      {
        productId: DEMO_PRODUCT_IDS[8],
        warehouseId: platform.id,
        movements: [
          { type: 'IN', quantity: 14, origin: 'Complément carrière Allada (démo)', daysAgo: 7 },
          { type: 'ADJUSTMENT', quantity: 34, origin: 'Inventaire tournant — ajustement démo', daysAgo: 1 },
        ],
      },
    ]

    for (const block of samples) {
      const sid = stockId(block.productId, block.warehouseId)
      if (!sid) continue
      for (const m of block.movements) {
        await StockMovement.create({
          stockId: sid,
          type: m.type,
          quantity: m.quantity,
          origin: m.origin,
          referenceId: null,
          createdBy: null,
          date: now.minus({ days: m.daysAgo }),
        })
      }
    }
  }
}
