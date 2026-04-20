import db from '@adonisjs/lucid/services/db'
import { applyDateRange, type DateRange } from '#services/date_range'

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

export interface StockAlertRow {
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
  latestSnapshots: StockAlertRow[]
}

export function qualityFailureRate(total: number, failed: number): number {
  if (total <= 0) return 0
  return Math.round((failed / total) * 10000) / 100
}

function periodStamp(range?: DateRange): { from: string | null; to: string | null } {
  return {
    from: range?.from?.toISO() ?? null,
    to: range?.to?.toISO() ?? null,
  }
}

// ---------------------------------------------------------------------------
// Dashboard (unchanged — aggregates across all time)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Sales report (with optional date range)
// ---------------------------------------------------------------------------

export async function computeSalesReport(range?: DateRange): Promise<SalesReport> {
  const statusQuery = db.from('report_orders').select('status').count('* as c').groupBy('status')
  applyDateRange(statusQuery, range ?? {}, 'created_at')
  const ordersByStatusRows = await statusQuery

  const totalsQuery = db
    .from('report_orders')
    .whereIn('status', ['VALIDATED', 'SHIPPED', 'DELIVERED'])
  applyDateRange(totalsQuery, range ?? {}, 'created_at')
  const totalsRow = (await totalsQuery.sum('total_amount as s').count('* as c').first()) as
    | { s?: number | string | null; c?: number | string | null }
    | undefined

  const totalOrders = ordersByStatusRows.reduce((acc, r) => acc + Number(r.c), 0)
  const totalRevenue = Number(totalsRow?.s ?? 0)
  const billedCount = Number(totalsRow?.c ?? 0)

  return {
    period: periodStamp(range),
    ordersByStatus: ordersByStatusRows.map((r) => ({
      status: String(r.status),
      count: Number(r.c),
    })),
    totalOrders,
    totalRevenue,
    averageOrderValue: billedCount > 0 ? Math.round((totalRevenue / billedCount) * 100) / 100 : 0,
  }
}

// ---------------------------------------------------------------------------
// Production report (with optional date range)
// ---------------------------------------------------------------------------

export async function computeProductionReport(range?: DateRange): Promise<ProductionReport> {
  const q = db
    .from('report_production_orders')
    .select('status')
    .count('* as c')
    .groupBy('status')
  applyDateRange(q, range ?? {}, 'created_at')
  const rows = await q

  const byStatus = rows.map((r) => ({ status: String(r.status), count: Number(r.c) }))
  const totalProductionOrders = byStatus.reduce((acc, r) => acc + r.count, 0)
  const completedCount = byStatus.find((r) => r.status === 'COMPLETED')?.count ?? 0
  const rejectedCount =
    (byStatus.find((r) => r.status === 'QUALITY_FAILED')?.count ?? 0) +
    (byStatus.find((r) => r.status === 'REJECTED')?.count ?? 0)

  return {
    period: periodStamp(range),
    byStatus,
    totalProductionOrders,
    completedCount,
    rejectedCount,
  }
}

// ---------------------------------------------------------------------------
// Quality report (BF 7 — taux d'échec + top produits rejetés)
// ---------------------------------------------------------------------------

export async function computeQualityReport(range?: DateRange): Promise<QualityReport> {
  const base = db.from('report_production_orders')
  applyDateRange(base, range ?? {}, 'created_at')

  const total = await base.clone().count('* as c').first()
  const completed = await base
    .clone()
    .where('status', 'COMPLETED')
    .count('* as c')
    .first()
  const rejected = await base
    .clone()
    .whereIn('status', ['REJECTED', 'QUALITY_FAILED'])
    .count('* as c')
    .first()

  const topRejectedRows = await base
    .clone()
    .select('product_id')
    .whereIn('status', ['REJECTED', 'QUALITY_FAILED'])
    .count('* as c')
    .groupBy('product_id')
    .orderBy('c', 'desc')
    .limit(5)

  const completedCount = Number(completed?.c ?? 0)
  const rejectedCount = Number(rejected?.c ?? 0)
  const totalInspected = Number(total?.c ?? 0)

  return {
    period: periodStamp(range),
    totalInspected,
    completedCount,
    rejectedCount,
    failureRate: qualityFailureRate(completedCount + rejectedCount, rejectedCount),
    topRejectedProducts: topRejectedRows.map((r) => ({
      productId: String(r.product_id),
      rejectedCount: Number(r.c),
    })),
  }
}

// ---------------------------------------------------------------------------
// Stock report (alerts snapshots, optional warehouse/period filters)
// ---------------------------------------------------------------------------

export async function computeStockReport(
  warehouseId?: string | null,
  range?: DateRange
): Promise<StockReport> {
  const q = db.from('report_stock_snapshots').where('is_critical', true)
  applyDateRange(q, range ?? {}, 'snapshot_at')
  if (warehouseId) q.where('warehouse_id', warehouseId)

  const totalsQ = q.clone().count('* as c').first()
  const distinctQ = q.clone().countDistinct('product_id as c').first()
  const listQ = q.clone().orderBy('snapshot_at', 'desc').limit(100)

  const [totalsRow, distinctRow, rows] = await Promise.all([totalsQ, distinctQ, listQ])

  return {
    period: periodStamp(range),
    warehouseId: warehouseId ?? null,
    totalAlerts: Number((totalsRow as any)?.c ?? 0),
    distinctProducts: Number((distinctRow as any)?.c ?? 0),
    latestSnapshots: rows.map((r) => ({
      productId: String(r.product_id),
      warehouseId: r.warehouse_id ? String(r.warehouse_id) : null,
      quantity: Number(r.quantity),
      reserved: Number(r.reserved),
      threshold: Number(r.threshold),
      snapshotAt:
        r.snapshot_at instanceof Date ? r.snapshot_at.toISOString() : String(r.snapshot_at),
    })),
  }
}

// ---------------------------------------------------------------------------
// Alerts list (kept for existing `criticalStockAlerts` query)
// ---------------------------------------------------------------------------

export async function computeCriticalStockAlerts(): Promise<StockAlertRow[]> {
  const rows = await db
    .from('report_stock_snapshots')
    .where('is_critical', true)
    .orderBy('snapshot_at', 'desc')
    .limit(100)
  return rows.map((r) => ({
    productId: String(r.product_id),
    warehouseId: r.warehouse_id ? String(r.warehouse_id) : null,
    quantity: Number(r.quantity),
    reserved: Number(r.reserved),
    threshold: Number(r.threshold),
    snapshotAt:
      r.snapshot_at instanceof Date ? r.snapshot_at.toISOString() : String(r.snapshot_at),
  }))
}

// ---------------------------------------------------------------------------
// CSV export helpers
// ---------------------------------------------------------------------------

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines: string[] = []
  lines.push(headers.map(csvEscape).join(','))
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','))
  }
  return lines.join('\n') + '\n'
}

export type ExportType = 'sales' | 'production' | 'quality' | 'stock' | 'invoices' | 'orders'

export async function exportReportCsv(
  type: ExportType,
  range?: DateRange,
  warehouseId?: string | null
): Promise<string> {
  switch (type) {
    case 'sales': {
      const report = await computeSalesReport(range)
      return toCsv(
        ['status', 'count'],
        report.ordersByStatus.map((r) => [r.status, r.count])
      )
    }
    case 'production': {
      const report = await computeProductionReport(range)
      return toCsv(
        ['status', 'count'],
        report.byStatus.map((r) => [r.status, r.count])
      )
    }
    case 'quality': {
      const report = await computeQualityReport(range)
      const header = ['productId', 'rejectedCount']
      const detail = report.topRejectedProducts.map((r) => [r.productId, r.rejectedCount])
      const summary: Array<Array<unknown>> = [
        ['TOTAL_INSPECTED', report.totalInspected],
        ['COMPLETED', report.completedCount],
        ['REJECTED', report.rejectedCount],
        ['FAILURE_RATE_PERCENT', report.failureRate],
      ]
      return (
        toCsv(['metric', 'value'], summary) + '\n' + toCsv(header, detail)
      )
    }
    case 'stock': {
      const report = await computeStockReport(warehouseId ?? null, range)
      return toCsv(
        ['productId', 'warehouseId', 'quantity', 'reserved', 'threshold', 'snapshotAt'],
        report.latestSnapshots.map((r) => [
          r.productId,
          r.warehouseId ?? '',
          r.quantity,
          r.reserved,
          r.threshold,
          r.snapshotAt,
        ])
      )
    }
    case 'orders': {
      const q = db
        .from('report_orders')
        .select('order_id', 'customer_id', 'status', 'total_amount', 'created_at')
        .orderBy('created_at', 'desc')
      applyDateRange(q, range ?? {}, 'created_at')
      const rows = await q
      return toCsv(
        ['orderId', 'customerId', 'status', 'totalAmount', 'createdAt'],
        rows.map((r) => [
          r.order_id,
          r.customer_id ?? '',
          r.status,
          r.total_amount,
          r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        ])
      )
    }
    case 'invoices': {
      const q = db
        .from('report_invoices')
        .select('invoice_id', 'order_id', 'status', 'amount', 'issued_at')
        .orderBy('issued_at', 'desc')
      applyDateRange(q, range ?? {}, 'issued_at')
      const rows = await q
      return toCsv(
        ['invoiceId', 'orderId', 'status', 'amount', 'issuedAt'],
        rows.map((r) => [
          r.invoice_id,
          r.order_id ?? '',
          r.status,
          r.amount,
          r.issued_at instanceof Date ? r.issued_at.toISOString() : String(r.issued_at),
        ])
      )
    }
  }
}
