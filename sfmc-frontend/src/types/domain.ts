export interface User {
  id: string
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  role: 'ADMIN' | 'OPERATOR' | 'CLIENT'
  isActive?: boolean
  createdAt: string
  updatedAt: string
}

export type ProductCategory = 'CIMENT' | 'FER' | 'BRIQUES' | 'GRANULATS'

export interface Product {
  id: string
  /** Absent côté API produit actuel ; repli UI sur `unit` ou tronqué `id`. */
  sku?: string
  name: string
  description?: string | null
  /** URL absolue (https://…) affichée catalogue ; optionnel. */
  imageUrl?: string | null
  category: ProductCategory
  unit: string
  unitPrice: number
  currency?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Warehouse {
  id: string
  name: string
  location: string
  capacity: number
  createdAt: string
  updatedAt?: string
}

export interface Stock {
  id: string
  productId: string
  warehouseId?: string
  quantity: number
  reserved: number
  threshold: number
  createdAt: string
  updatedAt: string
}

export interface StockAlert {
  id: string
  productId: string
  currentQuantity: number
  threshold: number
  severity: 'LOW' | 'CRITICAL'
  createdAt: string
}

export interface StockMovement {
  id: string
  stockId: string
  type: 'IN' | 'OUT' | 'ADJUSTMENT'
  quantity: number
  origin: string
  referenceId?: string | null
  date?: string
}

/** Réception produit fini après production — en attente de choix d’entrepôt. */
export interface PendingStockReception {
  id: string
  productionOrderId: string
  productId: string
  quantity: number
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED'
  warehouseId: string | null
  confirmedQuantity: number | null
  confirmedByUserId: string | null
  confirmedAt: string | null
  sourceEventId: string | null
  createdAt: string
  updatedAt: string
}

export interface CheckAvailabilityResult {
  available: boolean
  currentStock: number
  productId: string
}

export interface ReserveReleaseLine {
  productId: string
  quantity: number
}

/** Ligne renvoyée par `criticalStocks` (GraphQL inventaire). */
export interface CriticalStockGqlRow {
  id: string
  productId: string
  warehouseId: string
  quantity: number
  reserved: number
  available: number
  threshold: number
  isCritical: boolean
  warehouse?: { id: string; name: string } | null
}

export type OrderStatus =
  | 'PENDING'
  | 'VALIDATED'
  | 'IN_PRODUCTION'
  | 'READY'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'

/** Répartition d’expédition multi-entrepôts (PUT /orders/:id/status). */
export interface OrderShipmentAllocation {
  productId: string
  quantity: number
  warehouseId: string
}

export interface OrderLine {
  id?: string
  productId: string
  /** Libellé figé à la commande (order-service) ; peut être absent sur d’anciennes lignes. */
  productName?: string | null
  quantity: number
  unitPrice: number
}

/** Présent si le flux « paiement mobile money avant validation » (stub) est actif côté API. */
export type OrderPaymentStatus = 'AWAITING_MOBILE_MONEY' | 'PAID' | null

export interface Order {
  id: string
  /** Référence affichable (ex. CMD-2026-000001), distincte de l’UUID `id`. */
  orderNumber?: string
  customerId: string
  /** Libellé affichable (nom ou email), renseigné par order-service sur la liste. */
  customerDisplayName?: string | null
  status: OrderStatus
  sagaStatus?: string | null
  paymentStatus?: OrderPaymentStatus
  mobileMoneyPhone?: string | null
  mobileMoneyProviderRef?: string | null
  totalAmount: number
  currency: string
  lines: OrderLine[]
  createdAt: string
  updatedAt: string
}

export type ProductionStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'QUALITY_CHECK'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'

export interface ProductionOrder {
  id: string
  /** Absent si l’OF est créé sans commande liée. */
  orderId: string | null
  productId: string
  quantity: number
  status: ProductionStatus
  machineId?: string | null
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt?: string
}

export type MachineStatus = 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE'

export interface Machine {
  id: string
  name: string
  category: ProductCategory | null
  status: MachineStatus
  createdAt: string
  updatedAt?: string
}

export type InvoiceStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED'

export interface Invoice {
  id: string
  invoiceNumber?: string
  /** Numéro commande affichable (copie lors de la facturation). */
  orderPublicNumber?: string | null
  orderId: string
  customerId: string | null
  amount: number
  currency: string
  status: InvoiceStatus
  /** Non présent sur le schéma minimal factures ; repli UI sur `createdAt`. */
  dueDate?: string
  paidAt?: string
  createdAt: string
  payments?: Payment[]
}

export interface Payment {
  id: string
  invoiceId: string
  amount: number
  method: 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CASH'
  reference?: string
  createdAt: string
}

export interface CreditNote {
  id: string
  invoiceId: string
  orderId: string
  customerId: string | null
  amount: number
  currency: string
  reason: string | null
  createdAt: string
}

export interface Notification {
  id: string
  /** Code métier (ex. ORDER_VALIDATED). */
  type: string
  channel: string
  recipient: string
  status: 'SENT' | 'FAILED' | 'PENDING' | string
  payload?: string | null
  createdAt: string
  updatedAt?: string
}

export interface StatusCount {
  status: string
  count: number
}

export interface DashboardKpis {
  totalOrders: number
  totalRevenue: number
  paidInvoices: number
  pendingInvoices: number
  ordersByStatus: StatusCount[]
  productionCompleted: number
  productionQualityFailed: number
  qualityFailureRate: number
  criticalStockCount: number
  /** Legacy optional fields — non calculés par le reporting-service actuel */
  topProducts?: Array<{ productId: string; name: string; totalSold: number }>
  revenueByDay?: Array<{ date: string; amount: number }>
}

export interface SalesReport {
  period: { from: string | null; to: string | null }
  ordersByStatus: StatusCount[]
  totalOrders: number
  totalRevenue: number
  averageOrderValue: number
}

export interface ProductionReport {
  period: { from: string | null; to: string | null }
  byStatus: StatusCount[]
  totalProductionOrders: number
  completedCount: number
  rejectedCount: number
}

export interface QualityReport {
  period: { from: string | null; to: string | null }
  totalInspected: number
  completedCount: number
  rejectedCount: number
  failureRate: number
  topRejectedProducts: Array<{ productId: string; rejectedCount: number }>
}

export interface StockReportSnapshot {
  productId: string
  warehouseId: string | null
  quantity: number
  reserved: number
  threshold: number
  snapshotAt: string
}

export interface StockReport {
  period: { from: string | null; to: string | null }
  warehouseId: string | null
  totalAlerts: number
  distinctProducts: number
  latestSnapshots: StockReportSnapshot[]
}

export type ReportExportType = 'sales' | 'production' | 'quality' | 'stock' | 'orders' | 'invoices'

export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}
