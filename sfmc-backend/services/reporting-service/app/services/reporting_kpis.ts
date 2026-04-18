import db from '@adonisjs/lucid/services/db'

export interface StatusCount {
  status: string
  count: number
}

export interface DashboardKPIs {
  totalOrders: number
  totalRevenue: number
  paidInvoices: number
  pendingInvoices: number
  ordersByStatus: StatusCount[]
  productionCompleted: number
  productionQualityFailed: number
  qualityFailureRate: number
  criticalStockCount: number
}

export function qualityFailureRate(total: number, failed: number): number {
  if (total <= 0) return 0
  return Math.round((failed / total) * 10000) / 100
}

export async function computeDashboardKPIs(): Promise<DashboardKPIs> {
  const totalOrdersRow = await db.from('report_orders').count('* as c').first()
  const revenueRow = await db
    .from('report_orders')
    .whereIn('status', ['VALIDATED', 'SHIPPED', 'DELIVERED'])
    .sum('total_amount as s')
    .first()
  const paidRow = await db
    .from('report_invoices')
    .where('status', 'PAID')
    .count('* as c')
    .first()
  const pendingRow = await db
    .from('report_invoices')
    .where('status', 'PENDING')
    .count('* as c')
    .first()
  const ordersByStatusRows = await db
    .from('report_orders')
    .select('status')
    .count('* as c')
    .groupBy('status')
  const prodCompleted = await db
    .from('report_production_orders')
    .where('status', 'COMPLETED')
    .count('* as c')
    .first()
  const prodFailed = await db
    .from('report_production_orders')
    .where('status', 'QUALITY_FAILED')
    .count('* as c')
    .first()
  const criticalStock = await db
    .from('report_stock_snapshots')
    .where('is_critical', true)
    .count('* as c')
    .first()

  const completed = Number(prodCompleted?.c ?? 0)
  const failed = Number(prodFailed?.c ?? 0)

  return {
    totalOrders: Number(totalOrdersRow?.c ?? 0),
    totalRevenue: Number(revenueRow?.s ?? 0),
    paidInvoices: Number(paidRow?.c ?? 0),
    pendingInvoices: Number(pendingRow?.c ?? 0),
    ordersByStatus: ordersByStatusRows.map((r) => ({
      status: String(r.status),
      count: Number(r.c),
    })),
    productionCompleted: completed,
    productionQualityFailed: failed,
    qualityFailureRate: qualityFailureRate(completed + failed, failed),
    criticalStockCount: Number(criticalStock?.c ?? 0),
  }
}

export async function computeSalesReport(): Promise<StatusCount[]> {
  const rows = await db.from('report_orders').select('status').count('* as c').groupBy('status')
  return rows.map((r) => ({ status: String(r.status), count: Number(r.c) }))
}

export async function computeProductionReport(): Promise<StatusCount[]> {
  const rows = await db
    .from('report_production_orders')
    .select('status')
    .count('* as c')
    .groupBy('status')
  return rows.map((r) => ({ status: String(r.status), count: Number(r.c) }))
}

export async function computeCriticalStockAlerts() {
  const rows = await db
    .from('report_stock_snapshots')
    .where('is_critical', true)
    .orderBy('snapshot_at', 'desc')
    .limit(100)
  return rows.map((r) => ({
    productId: r.product_id,
    warehouseId: r.warehouse_id,
    quantity: Number(r.quantity),
    reserved: Number(r.reserved),
    threshold: Number(r.threshold),
    snapshotAt:
      r.snapshot_at instanceof Date ? r.snapshot_at.toISOString() : String(r.snapshot_at),
  }))
}
