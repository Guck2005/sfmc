import { ApolloServer } from '@apollo/server'
import { makeExecutableSchema } from '@graphql-tools/schema'
import {
  computeDashboardKPIs,
  computeSalesReport,
  computeProductionReport,
  computeQualityReport,
  computeStockReport,
  computeCriticalStockAlerts,
} from '#services/reporting_kpis'
import { parseDateRange } from '#services/date_range'
import { pubsub, TOPICS, productionOrderTopic } from './pubsub.js'

export const typeDefs = `#graphql
  type StatusCount {
    status: String!
    count: Int!
  }

  type Period {
    from: String
    to: String
  }

  type DashboardKPIs {
    totalOrders: Int!
    totalRevenue: Float!
    paidInvoices: Int!
    pendingInvoices: Int!
    ordersByStatus: [StatusCount!]!
    productionCompleted: Int!
    productionQualityFailed: Int!
    qualityFailureRate: Float!
    criticalStockCount: Int!
  }

  type SalesReport {
    period: Period!
    ordersByStatus: [StatusCount!]!
    totalOrders: Int!
    totalRevenue: Float!
    averageOrderValue: Float!
  }

  type ProductionReport {
    period: Period!
    byStatus: [StatusCount!]!
    totalProductionOrders: Int!
    completedCount: Int!
    rejectedCount: Int!
  }

  type QualityTopRejected {
    productId: ID!
    rejectedCount: Int!
  }

  type QualityReport {
    period: Period!
    totalInspected: Int!
    completedCount: Int!
    rejectedCount: Int!
    failureRate: Float!
    topRejectedProducts: [QualityTopRejected!]!
  }

  type StockAlert {
    productId: ID!
    warehouseId: ID
    quantity: Int!
    reserved: Int!
    threshold: Int!
    snapshotAt: String!
  }

  type StockReport {
    period: Period!
    warehouseId: ID
    totalAlerts: Int!
    distinctProducts: Int!
    latestSnapshots: [StockAlert!]!
  }

  type OrderStatusEvent {
    orderId: ID!
    status: String!
    updatedAt: String!
  }

  type ProductionOrderProgress {
    productionOrderId: ID!
    orderId: ID
    productId: ID!
    machineId: ID
    fromStatus: String
    toStatus: String!
    changedAt: String!
  }

  type Query {
    dashboardKPIs: DashboardKPIs!
    salesReport(from: String, to: String): SalesReport!
    productionReport(from: String, to: String): ProductionReport!
    qualityReport(from: String, to: String): QualityReport!
    stockReport(warehouseId: ID, from: String, to: String): StockReport!
    criticalStockAlerts: [StockAlert!]!
  }

  type Subscription {
    orderStatusUpdated: OrderStatusEvent!
    kpiUpdated: DashboardKPIs!
    productionOrderUpdated(id: ID!): ProductionOrderProgress!
    productionOrdersUpdated: ProductionOrderProgress!
  }
`

interface RangeArgs {
  from?: string | null
  to?: string | null
}

export const resolvers = {
  Query: {
    async dashboardKPIs() {
      return computeDashboardKPIs()
    },
    async salesReport(_: unknown, args: RangeArgs) {
      const range = parseDateRange({ from: args?.from, to: args?.to })
      return computeSalesReport(range)
    },
    async productionReport(_: unknown, args: RangeArgs) {
      const range = parseDateRange({ from: args?.from, to: args?.to })
      return computeProductionReport(range)
    },
    async qualityReport(_: unknown, args: RangeArgs) {
      const range = parseDateRange({ from: args?.from, to: args?.to })
      return computeQualityReport(range)
    },
    async stockReport(_: unknown, args: RangeArgs & { warehouseId?: string | null }) {
      const range = parseDateRange({ from: args?.from, to: args?.to })
      return computeStockReport(args?.warehouseId ?? null, range)
    },
    async criticalStockAlerts() {
      return computeCriticalStockAlerts()
    },
  },
  Subscription: {
    orderStatusUpdated: {
      subscribe: () => pubsub.asyncIterator(TOPICS.ORDER_STATUS_UPDATED),
      resolve: (payload: any) => payload,
    },
    kpiUpdated: {
      subscribe: () => pubsub.asyncIterator(TOPICS.KPI_UPDATED),
      resolve: (payload: any) => payload,
    },
    productionOrderUpdated: {
      subscribe: (_: any, args: { id: string }) => pubsub.asyncIterator(productionOrderTopic(args.id)),
      resolve: (payload: any) => payload,
    },
    productionOrdersUpdated: {
      subscribe: () => pubsub.asyncIterator(TOPICS.PRODUCTION_ORDER_UPDATED_ALL),
      resolve: (payload: any) => payload,
    },
  },
}

export const schema = makeExecutableSchema({ typeDefs, resolvers })
export const apolloServer = new ApolloServer({ schema })
