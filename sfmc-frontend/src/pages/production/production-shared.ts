import { z } from 'zod'
import type { MachineStatus, ProductCategory, ProductionStatus } from '@/types/domain'

export const STATUS_COLORS: Record<
  ProductionStatus,
  'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive'
> = {
  PLANNED: 'outline',
  IN_PROGRESS: 'warning',
  QUALITY_CHECK: 'secondary',
  COMPLETED: 'success',
  REJECTED: 'destructive',
  CANCELLED: 'secondary',
}

export const ALL_PO_STATUS: ProductionStatus[] = [
  'PLANNED',
  'IN_PROGRESS',
  'QUALITY_CHECK',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
]

export const TERMINAL: ProductionStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED']

export const PO_STATUS_LABELS: Record<ProductionStatus, string> = {
  PLANNED: 'Planifié',
  IN_PROGRESS: 'En cours',
  QUALITY_CHECK: 'Contrôle qualité',
  COMPLETED: 'Terminé',
  REJECTED: 'Rejeté',
  CANCELLED: 'Annulé',
}

export const MACHINE_STATUS_LABEL: Record<MachineStatus, string> = {
  AVAILABLE: 'Disponible',
  IN_USE: 'En production',
  MAINTENANCE: 'Maintenance',
}

export const MACHINE_CATEGORIES: ProductCategory[] = ['CIMENT', 'FER', 'BRIQUES', 'GRANULATS']

export const MACHINE_CATEGORY_LABEL: Record<ProductCategory, string> = {
  CIMENT: 'Ciment',
  FER: 'Fer',
  BRIQUES: 'Briques',
  GRANULATS: 'Granulats',
}

export const productionOrderSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1),
  orderId: z.string().uuid().optional(),
})
export type ProductionOrderFormIn = z.input<typeof productionOrderSchema>
export type ProductionOrderFormOut = z.output<typeof productionOrderSchema>

export const qualitySchema = z.object({
  passed: z.boolean(),
  notes: z.string().optional(),
})
export type QualityFormIn = z.input<typeof qualitySchema>
export type QualityFormOut = z.output<typeof qualitySchema>
