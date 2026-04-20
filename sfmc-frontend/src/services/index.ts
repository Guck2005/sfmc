import { api } from '@/lib/api'
import type {
  DashboardKpis,
  Invoice,
  Notification,
  Order,
  OrderLine,
  OrderStatus,
  PaginatedResponse,
  Payment,
  Product,
  ProductionOrder,
  Stock,
  StockAlert,
  User,
  Warehouse,
} from '@/types/domain'

/**
 * Le backend Adonis renvoie systématiquement :
 *   - ressource unique : { data: <T> }
 *   - liste paginée    : { data: <T[]>, meta: { total, currentPage, perPage, lastPage } }
 *
 * On unwrappe `data` pour les ressources uniques afin que les pages consomment
 * directement l'entité, et on conserve l'enveloppe complète pour les listes
 * (les composants utilisent ensuite `asArray()` ou `meta` selon leurs besoins).
 */

type Envelope<T> = { data: T }

const unwrap =
  <T>() =>
  (r: { data: Envelope<T> | T }) => {
    const body = r.data as Envelope<T> | T
    if (body && typeof body === 'object' && 'data' in (body as object)) {
      return (body as Envelope<T>).data
    }
    return body as T
  }

// ----------------------------------------------------------------------------
// Auth (public / admin)
// ----------------------------------------------------------------------------

export interface RegisterPayload {
  email: string
  password: string
  fullName?: string
  role?: User['role']
}

export const authService = {
  register: (payload: RegisterPayload) =>
    api
      .post<{
        data: {
          accessToken: string
          refreshToken: string
          tokenType: 'Bearer'
          expiresIn: number
          user: { id: string; email: string; role: User['role']; fullName: string | null }
        }
      }>('/auth/register', payload)
      .then((r) => r.data.data),
}

// ----------------------------------------------------------------------------
// Users
// ----------------------------------------------------------------------------

export const usersService = {
  list: (params?: { page?: number; limit?: number; role?: string }) =>
    api.get<PaginatedResponse<User>>('/users', { params }).then((r) => r.data),
  get: (id: string) => api.get<Envelope<User>>(`/users/${id}`).then(unwrap<User>()),
  /**
   * Création d'un utilisateur **avec compte d'authentification**.
   * On appelle `auth-service POST /auth/register`, qui publie l'event
   * `user.created` → user-service provisionne ensuite le profil complet.
   * Le payload accepte `firstName`/`lastName` pour rester compatible avec
   * les formulaires existants : on les concatène en `fullName`.
   */
  create: (payload: {
    firstName: string
    lastName: string
    email: string
    password: string
    role: User['role']
    phone?: string
  }) => {
    const fullName = [payload.firstName, payload.lastName].filter(Boolean).join(' ').trim()
    return authService.register({
      email: payload.email,
      password: payload.password,
      fullName: fullName || undefined,
      role: payload.role,
    })
  },
  update: (id: string, payload: Partial<User>) =>
    api.put<Envelope<User>>(`/users/${id}`, payload).then(unwrap<User>()),
  updateRole: (id: string, role: User['role']) =>
    api.put<Envelope<User>>(`/users/${id}/role`, { role }).then(unwrap<User>()),
  remove: (id: string) => api.delete(`/users/${id}`),
}

// ----------------------------------------------------------------------------
// Products
// ----------------------------------------------------------------------------

export const productsService = {
  list: (params?: { page?: number; limit?: number; category?: string; q?: string }) =>
    api.get<PaginatedResponse<Product>>('/products', { params }).then((r) => r.data),
  get: (id: string) => api.get<Envelope<Product>>(`/products/${id}`).then(unwrap<Product>()),
  create: (payload: Partial<Product>) =>
    api.post<Envelope<Product>>('/products', payload).then(unwrap<Product>()),
  update: (id: string, payload: Partial<Product>) =>
    api.put<Envelope<Product>>(`/products/${id}`, payload).then(unwrap<Product>()),
  remove: (id: string) => api.delete(`/products/${id}`),
}

// ----------------------------------------------------------------------------
// Inventory (stocks + warehouses)
// ----------------------------------------------------------------------------

export const inventoryService = {
  // Stocks
  listStocks: (params?: { productId?: string; warehouseId?: string; page?: number }) =>
    api.get<PaginatedResponse<Stock> | Stock[]>('/stocks', { params }).then((r) => r.data),
  alerts: () => api.get<Envelope<StockAlert[]> | StockAlert[]>('/stocks/alerts').then((r) => {
    const body = r.data as any
    return Array.isArray(body) ? (body as StockAlert[]) : (body?.data ?? [])
  }),
  byProduct: (productId: string) =>
    api
      .get<Envelope<Array<{ warehouseId: string; warehouseName: string; quantity: number; threshold: number }>>>(
        `/stocks/${productId}/warehouses`
      )
      .then((r) => r.data.data),
  createMovement: (payload: {
    productId: string
    warehouseId: string
    quantity: number
    type: 'IN' | 'OUT' | 'ADJUSTMENT'
    reason?: string
  }) => api.post('/stocks/movements', payload).then((r) => r.data),
  listMovements: (params?: { productId?: string; page?: number }) =>
    api.get('/stocks/movements', { params }).then((r) => r.data),
  updateThreshold: (id: string, threshold: number) =>
    api.put(`/stocks/${id}/threshold`, { threshold }).then((r) => r.data),

  // Warehouses — CRUD complet
  listWarehouses: () =>
    api.get<PaginatedResponse<Warehouse> | Warehouse[]>('/warehouses').then((r) => r.data),
  getWarehouse: (id: string) =>
    api.get<Envelope<Warehouse>>(`/warehouses/${id}`).then(unwrap<Warehouse>()),
  createWarehouse: (payload: { name: string; location: string; capacity: number }) =>
    api.post<Envelope<Warehouse>>('/warehouses', payload).then(unwrap<Warehouse>()),
  updateWarehouse: (id: string, payload: Partial<{ name: string; location: string; capacity: number }>) =>
    api.put<Envelope<Warehouse>>(`/warehouses/${id}`, payload).then(unwrap<Warehouse>()),
  removeWarehouse: (id: string) => api.delete(`/warehouses/${id}`),
}

// ----------------------------------------------------------------------------
// Orders
// ----------------------------------------------------------------------------

export const ordersService = {
  list: (params?: { page?: number; limit?: number; status?: OrderStatus }) =>
    api.get<PaginatedResponse<Order>>('/orders', { params }).then((r) => r.data),
  get: (id: string) => api.get<Envelope<Order>>(`/orders/${id}`).then(unwrap<Order>()),
  create: (payload: { customerId: string; lines: OrderLine[] }) =>
    api.post<Envelope<Order>>('/orders', payload).then(unwrap<Order>()),
  updateStatus: (id: string, status: OrderStatus) =>
    api.put<Envelope<Order>>(`/orders/${id}/status`, { status }).then(unwrap<Order>()),
  cancel: (id: string, reason?: string) =>
    api.post<Envelope<Order>>(`/orders/${id}/cancel`, { reason }).then(unwrap<Order>()),
  remove: (id: string) => api.delete(`/orders/${id}`),
}

// ----------------------------------------------------------------------------
// Production
// ----------------------------------------------------------------------------

export const productionService = {
  list: (params?: { page?: number; limit?: number; status?: string; productId?: string; orderId?: string }) =>
    api
      .get<PaginatedResponse<ProductionOrder> | ProductionOrder[]>('/production-orders', { params })
      .then((r) => r.data),
  get: (id: string) =>
    api.get<Envelope<ProductionOrder>>(`/production-orders/${id}`).then(unwrap<ProductionOrder>()),
  create: (payload: { productId: string; quantity: number; orderId?: string }) =>
    api
      .post<Envelope<ProductionOrder>>('/production-orders', payload)
      .then(unwrap<ProductionOrder>()),
  updateStatus: (id: string, status: ProductionOrder['status']) =>
    api.put(`/production-orders/${id}/status`, { status }).then((r) => r.data),
  qualityControl: (id: string, payload: { passed: boolean; notes?: string }) =>
    api.post(`/production-orders/${id}/quality`, payload).then((r) => r.data),
}

// ----------------------------------------------------------------------------
// Billing
// ----------------------------------------------------------------------------

export const billingService = {
  listInvoices: (params?: {
    page?: number
    limit?: number
    status?: string
    customerId?: string
    orderId?: string
  }) => api.get<PaginatedResponse<Invoice>>('/invoices', { params }).then((r) => r.data),
  get: (id: string) => api.get<Envelope<Invoice>>(`/invoices/${id}`).then(unwrap<Invoice>()),
  listPayments: (id: string) =>
    api.get<Envelope<Payment[]>>(`/invoices/${id}/payments`).then((r) => r.data.data),
  recordPayment: (id: string, payload: Partial<Payment>) =>
    api.post<Envelope<Payment>>(`/invoices/${id}/payments`, payload).then(unwrap<Payment>()),
  pdfUrl: (id: string) => `/api/v1/invoices/${id}/pdf`,
}

// ----------------------------------------------------------------------------
// Notifications
// ----------------------------------------------------------------------------

export const notificationsService = {
  list: (params?: { page?: number; limit?: number; status?: string; channel?: string; recipient?: string; type?: string }) =>
    api
      .get<PaginatedResponse<Notification> | Notification[]>('/notifications', { params })
      .then((r) => r.data),
  get: (id: string) =>
    api.get<Envelope<Notification>>(`/notifications/${id}`).then(unwrap<Notification>()),
}

// ----------------------------------------------------------------------------
// Reporting
// ----------------------------------------------------------------------------

export const reportingService = {
  dashboard: () =>
    api.get<Envelope<DashboardKpis>>('/reports/dashboard').then((r) => r.data.data),
}
