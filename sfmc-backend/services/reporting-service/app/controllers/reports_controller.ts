import type { HttpContext } from '@adonisjs/core/http'
import {
  computeDashboardKPIs,
  computeSalesReport,
  computeProductionReport,
  computeQualityReport,
  computeStockReport,
  exportReportCsv,
  type ExportType,
} from '#services/reporting_kpis'
import { parseDateRange, rangeLabel } from '#services/date_range'

const ALLOWED_EXPORTS: ExportType[] = [
  'sales',
  'production',
  'quality',
  'stock',
  'orders',
  'invoices',
]

export default class ReportsController {
  async dashboard(ctx: HttpContext) {
    const { request, response } = ctx
    const auth = (ctx as unknown as { auth?: { id: string; role: string } }).auth
    const range = parseDateRange({
      from: request.input('from'),
      to: request.input('to'),
    })
    const customerId = auth?.role === 'CLIENT' ? auth.id : null
    const kpis = await computeDashboardKPIs({ range, customerId })
    return response.ok({ data: kpis })
  }

  async sales({ request, response }: HttpContext) {
    const range = parseDateRange({
      from: request.input('from'),
      to: request.input('to'),
    })
    const data = await computeSalesReport(range)
    return response.ok({ data })
  }

  async production({ request, response }: HttpContext) {
    const range = parseDateRange({
      from: request.input('from'),
      to: request.input('to'),
    })
    const data = await computeProductionReport(range)
    return response.ok({ data })
  }

  async quality({ request, response }: HttpContext) {
    const range = parseDateRange({
      from: request.input('from'),
      to: request.input('to'),
    })
    const data = await computeQualityReport(range)
    return response.ok({ data })
  }

  async stock({ request, response }: HttpContext) {
    const range = parseDateRange({
      from: request.input('from'),
      to: request.input('to'),
    })
    const warehouseId = request.input('warehouseId') ?? null
    const data = await computeStockReport(warehouseId, range)
    return response.ok({ data })
  }

  async exportCsv({ request, response, params }: HttpContext) {
    const type = String(params.type || '').toLowerCase() as ExportType
    if (!ALLOWED_EXPORTS.includes(type)) {
      return response.badRequest({
        error: `unknown report type "${type}"`,
        allowed: ALLOWED_EXPORTS,
      })
    }
    const range = parseDateRange({
      from: request.input('from'),
      to: request.input('to'),
    })
    const warehouseId = request.input('warehouseId') ?? null
    const csv = await exportReportCsv(type, range, warehouseId)
    const filename = `${type}_report_${rangeLabel(range)}.csv`
    response.header('content-type', 'text/csv; charset=utf-8')
    response.header('content-disposition', `attachment; filename="${filename}"`)
    return response.ok(csv)
  }
}
