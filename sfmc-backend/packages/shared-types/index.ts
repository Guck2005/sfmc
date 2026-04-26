// @sfmc/shared-types — Interfaces TypeScript partagées

export interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  isActive: boolean
  role: UserRole
  createdAt: string
}

export type UserRole = 'ADMIN' | 'OPERATOR' | 'CLIENT'

export interface Product {
  id: string
  name: string
  category: ProductCategory
  unit: string
  description?: string
  /** URL publique de l’image (optionnel). */
  imageUrl?: string | null
  isActive: boolean
}

export type ProductCategory = 'CIMENT' | 'FER' | 'BRIQUES' | 'GRANULATS'

export interface Order {
  id: string
  customerId: string
  status: OrderStatus
  sagaStatus?: string
  totalAmount: number
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
  id: string
  orderId: string
  productId: string
  quantity: number
  unitPrice: number
}

export interface DomainEvent {
  id: string
  type: string
  version: string
  timestamp: string
  payload: Record<string, unknown>
  metadata: {
    sourceService: string
    correlationId: string
    sagaId?: string
  }
}
