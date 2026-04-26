import axios from 'axios'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import type {
  CheckAvailabilityResult,
  CriticalStockGqlRow,
  DashboardKpis,
  ProductionReport,
  QualityReport,
  ReportExportType,
  SalesReport,
  StockReport,
  CreditNote,
  Invoice,
  Machine,
  Notification,
  Order,
  OrderLine,
  OrderShipmentAllocation,
  OrderStatus,
  PaginatedResponse,
  Payment,
  Product,
  ProductionOrder,
  ReserveReleaseLine,
  Stock,
  StockAlert,
  StockMovement,
  PendingStockReception,
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
  /** Upload image (ADMIN) — renvoie `{ url }` chemin relatif pour `imageUrl`. */
  uploadProductImage: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api
      .post<Envelope<{ url: string }>>('/products/upload-image', fd, { timeout: 60_000 })
      .then(unwrap<{ url: string }>())
  },
  list: (params?: {
    page?: number
    limit?: number
    category?: string
    isActive?: boolean | string
    q?: string
  }) => api.get<PaginatedResponse<Product>>('/products', { params }).then((r) => r.data),
  get: (id: string) => api.get<Envelope<Product>>(`/products/${id}`).then(unwrap<Product>()),
  create: (payload: {
    name: string
    category: string
    unit: string
    description?: string
    imageUrl?: string | null
    unitPrice: number
    isActive?: boolean
  }) => api.post<Envelope<Product>>('/products', payload).then(unwrap<Product>()),
  update: (
    id: string,
    payload: Partial<{
      name: string
      category: string
      unit: string
      description: string | null
      imageUrl: string | null
      unitPrice: number
      isActive: boolean
    }>
  ) => api.put<Envelope<Product>>(`/products/${id}`, payload).then(unwrap<Product>()),
  remove: (id: string) => api.delete(`/products/${id}`),
}

// ----------------------------------------------------------------------------
// Inventory (stocks + warehouses)
// ----------------------------------------------------------------------------

export const inventoryService = {
  // Stocks
  listStocks: (params?: { productId?: string; warehouseId?: string; page?: number; limit?: number }) =>
    api.get<PaginatedResponse<Stock> | Stock[]>('/stocks', { params }).then((r) => r.data),
  alerts: () => api.get<Envelope<StockAlert[]> | StockAlert[]>('/stocks/alerts').then((r) => {
    const body = r.data as any
    return Array.isArray(body) ? (body as StockAlert[]) : (body?.data ?? [])
  }),
  /** Stocks agrégés par produit (toutes lignes / entrepôts). */
  byProduct: (productId: string) =>
    api
      .get<Envelope<Stock[]>>(`/stocks/${encodeURIComponent(productId)}/warehouses`)
      .then(unwrap<Stock[]>())
      .then((rows) => (Array.isArray(rows) ? rows : [])),
  createMovement: (payload: {
    stockId: string
    type: 'IN' | 'OUT' | 'ADJUSTMENT'
    quantity: number
    origin: string
    referenceId?: string
  }) => api.post<Envelope<StockMovement>>('/stocks/movements', payload).then(unwrap<StockMovement>()),
  listMovements: (params?: { stockId?: string; type?: string; from?: string; to?: string }) =>
    api
      .get<Envelope<StockMovement[]>>('/stocks/movements', { params })
      .then(unwrap<StockMovement[]>())
      .then((rows) => (Array.isArray(rows) ? rows : [])),
  updateThreshold: (id: string, threshold: number) =>
    api.put<Envelope<Stock>>(`/stocks/${id}/threshold`, { threshold }).then(unwrap<Stock>()),
  listPendingReceptions: () =>
    api
      .get<Envelope<PendingStockReception[]>>('/stocks/pending-receptions')
      .then(unwrap<PendingStockReception[]>())
      .then((rows) => (Array.isArray(rows) ? rows : [])),
  confirmPendingReception: (id: string, body: { warehouseId: string; quantity?: number }) =>
    api
      .post<Envelope<{ pending: PendingStockReception; stock: Stock }>>(
        `/stocks/pending-receptions/${encodeURIComponent(id)}/confirm`,
        body
      )
      .then(unwrap<{ pending: PendingStockReception; stock: Stock }>()),
  checkAvailability: (payload: { productId: string; quantity: number }) =>
    api
      .post<Envelope<CheckAvailabilityResult>>('/stocks/check-availability', payload)
      .then(unwrap<CheckAvailabilityResult>()),
  reserve: (payload: { orderId: string; sagaId?: string; lines: ReserveReleaseLine[] }) =>
    api.post('/stocks/reserve', payload).then((r) => r.data),
  release: (payload: { orderId: string; sagaId?: string; lines: ReserveReleaseLine[] }) =>
    api.post('/stocks/release', payload).then((r) => r.data),

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

async function postInventoryGraphql<TData>(body: {
  query: string
  variables?: Record<string, unknown>
}): Promise<TData> {
  const token = useAuthStore.getState().token
  const { data } = await axios.post<{ data?: TData; errors?: readonly { message: string }[] }>(
    '/api/inventory/graphql',
    body,
    {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }
  )
  if (data.errors?.length) throw new Error(data.errors.map((e) => e.message).join('; '))
  if (data.data === undefined) throw new Error('Réponse GraphQL vide')
  return data.data
}

/** GraphQL inventory-service (proxy Vite : `/api/inventory/graphql` → `:3004/graphql`). */
export const inventoryGraphql = {
  criticalStocks: () =>
    postInventoryGraphql<{ criticalStocks: CriticalStockGqlRow[] }>({
      query: `query CriticalStocks {
        criticalStocks {
          id
          productId
          warehouseId
          quantity
          reserved
          available
          threshold
          isCritical
          warehouse { id name }
        }
      }`,
    }),
}

async function postProductGraphql<TData>(body: {
  query: string
  variables?: Record<string, unknown>
}): Promise<TData> {
  const token = useAuthStore.getState().token
  const { data } = await axios.post<{ data?: TData; errors?: readonly { message: string }[] }>(
    '/api/product/graphql',
    body,
    {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }
  )
  if (data.errors?.length) throw new Error(data.errors.map((e) => e.message).join('; '))
  if (data.data === undefined) throw new Error('Réponse GraphQL vide')
  return data.data
}

/** GraphQL product-service (proxy Vite : `/api/product/graphql` → `:3003/graphql`). */
export const productGraphql = {
  products: () =>
    postProductGraphql<{
      products: Array<{
        id: string
        name: string
        category: string
        unit: string
        unitPrice: number
        isActive: boolean
        createdAt: string
      }>
    }>({
      query: `{ products { id name category unit unitPrice isActive createdAt } }`,
    }),
}

// ----------------------------------------------------------------------------
// Orders
// ----------------------------------------------------------------------------

export const ordersService = {
  list: (params?: {
    page?: number
    limit?: number
    status?: OrderStatus
    customerId?: string
    /** YYYY-MM-DD — filtre sur `created_at` (début de journée locale). */
    from?: string
    /** YYYY-MM-DD — filtre sur `created_at` (fin de journée locale). */
    to?: string
  }) => api.get<PaginatedResponse<Order>>('/orders', { params }).then((r) => r.data),
  get: (id: string) => api.get<Envelope<Order>>(`/orders/${id}`).then(unwrap<Order>()),
  create: (payload: {
    customerId: string
    lines: OrderLine[]
    mobileMoneyPhone?: string
  }) => api.post<Envelope<Order>>('/orders', payload).then(unwrap<Order>()),
  initMobileMoney: (orderId: string, phone: string) =>
    api
      .post<{ data: Order; mobileMoney: { providerBaseUrlConfigured: boolean; providerBaseUrl: string | null; message: string } }>(
        `/orders/${orderId}/mobile-money/init`,
        { phone }
      )
      .then((r) => r.data),
  completeMobileMoneyLocal: (orderId: string) =>
    api.post<Envelope<Order>>(`/orders/${orderId}/mobile-money/complete-local`).then(unwrap<Order>()),
  updateStatus: (
    id: string,
    status: OrderStatus,
    opts?: { warehouseId?: string; allocations?: OrderShipmentAllocation[] }
  ) =>
    api
      .put<Envelope<Order>>(`/orders/${id}/status`, {
        status,
        ...(opts?.warehouseId ? { warehouseId: opts.warehouseId } : {}),
        ...(opts?.allocations?.length ? { allocations: opts.allocations } : {}),
      })
      .then(unwrap<Order>()),
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
    api.put<Envelope<ProductionOrder>>(`/production-orders/${id}/status`, { status }).then(unwrap<ProductionOrder>()),
  qualityControl: (id: string, payload: { passed: boolean; notes?: string }) =>
    api.post(`/production-orders/${id}/quality`, payload).then((r) => r.data),
  listMachines: (params?: { status?: string; category?: string; page?: number; limit?: number }) =>
    api.get<PaginatedResponse<Machine> | Machine[]>('/machines', { params }).then((r) => r.data),
  getMachine: (id: string) =>
    api.get<Envelope<Machine>>(`/machines/${id}`).then(unwrap<Machine>()),
  createMachine: (payload: {
    name: string
    category?: Machine['category'] | undefined
    status?: Machine['status']
  }) => api.post<Envelope<Machine>>('/machines', payload).then(unwrap<Machine>()),
  updateMachineStatus: (id: string, status: Machine['status']) =>
    api.put<Envelope<Machine>>(`/machines/${id}/status`, { status }).then(unwrap<Machine>()),
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
    api.get<Envelope<Payment[]>>(`/invoices/${id}/payments`).then(unwrap<Payment[]>()),
  recordPayment: (
    id: string,
    payload: { amount: number; method: 'CASH' | 'MOBILE_MONEY' | 'BANK_TRANSFER' }
  ) => api.post(`/invoices/${id}/payments`, payload).then((r) => r.data),
  getCreditNote: (id: string) =>
    api.get<Envelope<CreditNote>>(`/invoices/${id}/credit-note`).then(unwrap<CreditNote>()),
  pdfUrl: (id: string) => `/api/v1/invoices/${id}/pdf`,
  creditNotePdfUrl: (id: string) => `/api/v1/invoices/${id}/credit-note/pdf`,
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
  /** Total pour badge (requête légère `limit=1` + `meta.total`). */
  totalCount: async (params?: { status?: string; channel?: string; type?: string }) => {
    const r = await api.get<PaginatedResponse<Notification>>('/notifications', {
      params: { ...params, page: 1, limit: 1 },
    })
    return r.data.meta?.total ?? 0
  },
}

// ----------------------------------------------------------------------------
// Reporting
// ----------------------------------------------------------------------------

export const reportingService = {
  dashboard: (params?: { from?: string; to?: string }) =>
    api.get<Envelope<DashboardKpis>>('/reports/dashboard', { params }).then((r) => r.data.data),
  sales: (params?: { from?: string; to?: string }) =>
    api.get<{ data: SalesReport }>('/reports/sales', { params }).then((r) => r.data.data),
  production: (params?: { from?: string; to?: string }) =>
    api.get<{ data: ProductionReport }>('/reports/production', { params }).then((r) => r.data.data),
  quality: (params?: { from?: string; to?: string }) =>
    api.get<{ data: QualityReport }>('/reports/quality', { params }).then((r) => r.data.data),
  stock: (params?: { from?: string; to?: string; warehouseId?: string }) =>
    api.get<{ data: StockReport }>('/reports/stock', { params }).then((r) => r.data.data),
}

/** URL absolue (origine courante) pour téléchargement CSV avec `fetch` + Bearer. */
export function reportingCsvUrl(
  type: ReportExportType,
  params?: { from?: string; to?: string; warehouseId?: string }
) {
  const sp = new URLSearchParams()
  if (params?.from) sp.set('from', params.from)
  if (params?.to) sp.set('to', params.to)
  if (params?.warehouseId) sp.set('warehouseId', params.warehouseId)
  const q = sp.toString()
  return `${window.location.origin}/api/v1/reports/${type}/export.csv${q ? `?${q}` : ''}`
}
