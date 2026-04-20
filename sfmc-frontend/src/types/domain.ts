export interface User {
  id: string
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  role: 'ADMIN' | 'OPERATOR' | 'CLIENT'
  createdAt: string
  updatedAt: string
}

export interface Product {
  id: string
  sku: string
  name: string
  description?: string
  category?: string
  unitPrice: number
  currency: string
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
  stockType: 'RAW_MATERIAL' | 'FINISHED_PRODUCT' | 'WORK_IN_PROGRESS'
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

export type OrderStatus =
  | 'PENDING'
  | 'VALIDATED'
  | 'IN_PRODUCTION'
  | 'READY'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'

export interface OrderLine {
  id?: string
  productId: string
  quantity: number
  unitPrice: number
}

export interface Order {
  id: string
  customerId: string
  status: OrderStatus
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
  | 'FAILED'

export interface ProductionOrder {
  id: string
  orderId?: string
  productId: string
  quantity: number
  status: ProductionStatus
  startedAt?: string
  completedAt?: string
  qualityScore?: number
  createdAt: string
}

export type InvoiceStatus = 'DRAFT' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED'

export interface Invoice {
  id: string
  invoiceNumber: string
  orderId: string
  customerId: string
  amount: number
  currency: string
  status: InvoiceStatus
  dueDate: string
  paidAt?: string
  createdAt: string
}

export interface Payment {
  id: string
  invoiceId: string
  amount: number
  method: 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CASH' | 'CARD'
  reference?: string
  createdAt: string
}

export interface Notification {
  id: string
  type: 'EMAIL' | 'SMS' | 'PUSH'
  recipient: string
  subject?: string
  status: 'SENT' | 'FAILED' | 'PENDING'
  createdAt: string
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

export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}
