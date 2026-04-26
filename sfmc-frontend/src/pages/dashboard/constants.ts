export const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  VALIDATED: 'Validée',
  IN_PRODUCTION: 'En production',
  READY: 'Prête',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
}

export const PRODUCTION_STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Planifié',
  IN_PROGRESS: 'En cours',
  QUALITY_CHECK: 'Contrôle qualité',
  COMPLETED: 'Terminé',
  FAILED: 'Rejeté',
  QUALITY_FAILED: 'Échec qualité',
  REJECTED: 'Rejeté',
}

export const KPI_SUBSCRIPTION = /* GraphQL */ `
  subscription OnKpiUpdate {
    kpiUpdated {
      totalOrders
      totalRevenue
      qualityFailureRate
      criticalStockCount
    }
  }
`

export const STOCK_PAGE_SIZE = 10
export const QUALITY_PAGE_SIZE = 8

export function periodHint(from: string, to: string) {
  if (!from && !to) return 'Toutes périodes (dates de commande)'
  if (from && to) return `Du ${from} au ${to}`
  if (from) return `Depuis le ${from}`
  return `Jusqu'au ${to}`
}
