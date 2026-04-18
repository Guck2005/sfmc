import type { HttpContext } from '@adonisjs/core/http'
import { computeDashboardKPIs } from '#services/reporting_kpis'

export default class ReportsController {
  async dashboard({ response }: HttpContext) {
    const kpis = await computeDashboardKPIs()
    return response.ok({ data: kpis })
  }
}
