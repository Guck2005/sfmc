import { ApolloServer } from '@apollo/server'
import db from '@adonisjs/lucid/services/db'
import {
  createOrder,
  cancelOrder,
  ServiceUnavailableError,
  InsufficientStockError,
  ProductNotFoundError,
  ProductCatalogUnavailableError,
} from '#services/order_service'
import { GraphQLError } from 'graphql'

const typeDefs = `#graphql
  enum OrderStatus {
    PENDING
    VALIDATED
    IN_PRODUCTION
    READY
    SHIPPED
    DELIVERED
    CANCELLED
  }

  type OrderLine {
    id: ID!
    productId: ID!
    productName: String
    quantity: Float!
    unitPrice: Float!
  }

  type Order {
    id: ID!
    orderNumber: String!
    customerId: ID!
    status: OrderStatus!
    sagaStatus: String
    totalAmount: Float!
    lines: [OrderLine!]!
    createdAt: String!
  }

  input OrderLineInput {
    productId: ID!
    quantity: Float!
    unitPrice: Float!
  }

  input CreateOrderInput {
    customerId: ID!
    lines: [OrderLineInput!]!
  }

  type Query {
    orders(status: OrderStatus, customerId: ID): [Order!]!
    order(id: ID!): Order
  }

  type Mutation {
    createOrder(input: CreateOrderInput!): Order!
    cancelOrder(id: ID!): Order!
  }
`

function mapOrder(row: Record<string, any>, lines: Record<string, any>[] = []) {
  return {
    id: row.id,
    orderNumber: row.order_number ?? row.orderNumber,
    customerId: row.customer_id,
    status: row.status,
    sagaStatus: row.saga_status,
    totalAmount: Number(row.total_amount),
    lines: lines.map((l) => ({
      id: l.id,
      productId: l.product_id,
      productName: l.product_name ?? null,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unit_price),
    })),
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }
}

const resolvers = {
  Query: {
    async orders(_: unknown, args: { status?: string; customerId?: string }) {
      const query = db.from('orders').select('*').orderBy('created_at', 'desc').limit(500)
      if (args.status) query.where('status', args.status)
      if (args.customerId) query.where('customer_id', args.customerId)
      const rows = await query
      if (rows.length === 0) return []
      const allLines = await db
        .from('order_lines')
        .whereIn(
          'order_id',
          rows.map((r) => r.id)
        )
      const linesByOrder = new Map<string, any[]>()
      for (const l of allLines) {
        const arr = linesByOrder.get(l.order_id) ?? []
        arr.push(l)
        linesByOrder.set(l.order_id, arr)
      }
      return rows.map((r) => mapOrder(r, linesByOrder.get(r.id) ?? []))
    },
    async order(_: unknown, args: { id: string }) {
      const row = await db.from('orders').where('id', args.id).first()
      if (!row) return null
      const lines = await db.from('order_lines').where('order_id', args.id)
      return mapOrder(row, lines)
    },
  },
  Mutation: {
    async createOrder(_: unknown, args: { input: { customerId: string; lines: any[] } }) {
      try {
        const order = await createOrder(args.input)
        const lines = await db.from('order_lines').where('order_id', order.id)
        return mapOrder(
          {
            id: order.id,
            order_number: order.orderNumber,
            customer_id: order.customerId,
            status: order.status,
            saga_status: order.sagaStatus,
            total_amount: order.totalAmount,
            created_at: order.createdAt.toJSDate(),
          },
          lines
        )
      } catch (err) {
        if (err instanceof ServiceUnavailableError) {
          throw new GraphQLError(err.message, { extensions: { code: 'SERVICE_UNAVAILABLE' } })
        }
        if (err instanceof InsufficientStockError) {
          throw new GraphQLError(err.message, {
            extensions: {
              code: 'INSUFFICIENT_STOCK',
              productId: err.productId,
              requested: err.requested,
              available: err.available,
            },
          })
        }
        if (err instanceof ProductNotFoundError) {
          throw new GraphQLError(err.message, {
            extensions: { code: 'PRODUCT_NOT_FOUND', productId: err.productId },
          })
        }
        if (err instanceof ProductCatalogUnavailableError) {
          throw new GraphQLError(err.message, { extensions: { code: 'PRODUCT_CATALOG_UNAVAILABLE' } })
        }
        throw err
      }
    },
    async cancelOrder(_: unknown, args: { id: string }) {
      const order = await cancelOrder(args.id)
      const lines = await db.from('order_lines').where('order_id', order.id)
      return mapOrder(
        {
          id: order.id,
          order_number: order.orderNumber,
          customer_id: order.customerId,
          status: order.status,
          saga_status: order.sagaStatus,
          total_amount: order.totalAmount,
          created_at: order.createdAt.toJSDate(),
        },
        lines
      )
    },
  },
}

export const apolloServer = new ApolloServer({ typeDefs, resolvers })
