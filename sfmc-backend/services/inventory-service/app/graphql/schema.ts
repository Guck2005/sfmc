import { ApolloServer } from '@apollo/server'
import db from '@adonisjs/lucid/services/db'

const typeDefs = `#graphql
  enum MovementType { IN OUT ADJUSTMENT }

  type Warehouse {
    id: ID!
    name: String!
    location: String!
    capacity: Float!
  }

  type Stock {
    id: ID!
    productId: ID!
    warehouseId: ID!
    warehouse: Warehouse
    quantity: Float!
    reserved: Float!
    available: Float!
    threshold: Float!
    isCritical: Boolean!
  }

  type StockMovement {
    id: ID!
    stockId: ID!
    type: MovementType!
    quantity: Float!
    origin: String!
    referenceId: ID
    date: String!
  }

  type Query {
    stocks(warehouseId: ID, productId: ID): [Stock!]!
    stockMovements(productId: ID, stockId: ID, from: String, to: String): [StockMovement!]!
    criticalStocks: [Stock!]!
    warehouses: [Warehouse!]!
  }
`

function mapStock(row: Record<string, any>) {
  const quantity = Number(row.quantity)
  const reserved = Number(row.reserved)
  const threshold = Number(row.threshold)
  const available = quantity - reserved
  return {
    id: row.id,
    productId: row.product_id,
    warehouseId: row.warehouse_id,
    warehouse: row.wh_id
      ? { id: row.wh_id, name: row.wh_name, location: row.wh_location, capacity: Number(row.wh_capacity) }
      : null,
    quantity,
    reserved,
    available,
    threshold,
    isCritical: available < threshold,
  }
}

function mapMovement(row: Record<string, any>) {
  return {
    id: row.id,
    stockId: row.stock_id,
    type: row.type,
    quantity: Number(row.quantity),
    origin: row.origin,
    referenceId: row.reference_id,
    date: row.date instanceof Date ? row.date.toISOString() : String(row.date),
  }
}

const resolvers = {
  Query: {
    async stocks(_: unknown, args: { warehouseId?: string; productId?: string }) {
      const query = db
        .from('stocks as s')
        .leftJoin('warehouses as w', 'w.id', 's.warehouse_id')
        .select(
          's.*',
          'w.id as wh_id',
          'w.name as wh_name',
          'w.location as wh_location',
          'w.capacity as wh_capacity'
        )
        .orderBy('s.product_id')
      if (args.warehouseId) query.where('s.warehouse_id', args.warehouseId)
      if (args.productId) query.where('s.product_id', args.productId)
      const rows = await query
      return rows.map(mapStock)
    },
    async criticalStocks() {
      const rows = await db
        .from('stocks as s')
        .leftJoin('warehouses as w', 'w.id', 's.warehouse_id')
        .select(
          's.*',
          'w.id as wh_id',
          'w.name as wh_name',
          'w.location as wh_location',
          'w.capacity as wh_capacity'
        )
        .whereRaw('(s.quantity - s.reserved) < s.threshold')
      return rows.map(mapStock)
    },
    async stockMovements(
      _: unknown,
      args: { productId?: string; stockId?: string; from?: string; to?: string }
    ) {
      const query = db.from('stock_movements').select('*').orderBy('date', 'desc').limit(500)
      if (args.stockId) query.where('stock_id', args.stockId)
      if (args.productId) {
        const stockIds = await db.from('stocks').where('product_id', args.productId).select('id')
        query.whereIn('stock_id', stockIds.map((s) => s.id))
      }
      if (args.from) query.where('date', '>=', args.from)
      if (args.to) query.where('date', '<=', args.to)
      const rows = await query
      return rows.map(mapMovement)
    },
    async warehouses() {
      const rows = await db.from('warehouses').select('*').orderBy('name')
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        location: r.location,
        capacity: Number(r.capacity),
      }))
    },
  },
}

export const apolloServer = new ApolloServer({ typeDefs, resolvers })
