import { ApolloServer } from '@apollo/server'
import {
  computeDashboardKPIs,
  computeSalesReport,
  computeProductionReport,
  computeCriticalStockAlerts,
} from '#services/reporting_kpis'

const typeDefs = `#graphql
  type StatusCount {
    status: String!
    count: Int!
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
    ordersByStatus: [StatusCount!]!
  }

  type ProductionReport {
    byStatus: [StatusCount!]!
  }

  type StockAlert {
    productId: ID!
    warehouseId: ID
    quantity: Int!
    reserved: Int!
    threshold: Int!
    snapshotAt: String!
  }

  type Query {
    dashboardKPIs: DashboardKPIs!
    salesReport: SalesReport!
    productionReport: ProductionReport!
    criticalStockAlerts: [StockAlert!]!
  }
`

const resolvers = {
  Query: {
    async dashboardKPIs() {
      return computeDashboardKPIs()
    },
    async salesReport() {
      const ordersByStatus = await computeSalesReport()
      return { ordersByStatus }
    },
    async productionReport() {
      const byStatus = await computeProductionReport()
      return { byStatus }
    },
    async criticalStockAlerts() {
      return computeCriticalStockAlerts()
    },
  },
}

export const apolloServer = new ApolloServer({ typeDefs, resolvers })
