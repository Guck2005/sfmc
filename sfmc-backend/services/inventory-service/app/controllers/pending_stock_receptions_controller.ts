import type { HttpContext } from '@adonisjs/core/http'
import PendingStockEntry from '#models/pending_stock_entry'
import { confirmPendingReceptionValidator } from '#validators/pending_stock_validator'
import {
  confirmPendingStockReception,
  PendingStockEntryInvalidStateError,
  PendingStockEntryNotFoundError,
} from '#services/pending_stock_reception_service'

export default class PendingStockReceptionsController {
  /**
   * GET /api/v1/stocks/pending-receptions
   */
  async index({ response }: HttpContext) {
    const rows = await PendingStockEntry.query().where('status', 'PENDING').orderBy('createdAt', 'desc')
    return response.ok({ data: rows.map((r) => r.serialize()) })
  }

  /**
   * POST /api/v1/stocks/pending-receptions/:id/confirm
   */
  async confirm(ctx: HttpContext) {
    const { params, request, response } = ctx
    const payload = await request.validateUsing(confirmPendingReceptionValidator)
    const userId = (ctx as unknown as { auth?: { id: string } }).auth?.id
    if (!userId) {
      return response.unauthorized({ error: { code: 'UNAUTHENTICATED', message: 'Utilisateur requis' } })
    }
    try {
      const { pending, stock } = await confirmPendingStockReception({
        pendingId: params.id,
        warehouseId: payload.warehouseId,
        quantity: payload.quantity,
        userId,
      })
      return response.ok({
        data: {
          pending: pending.serialize(),
          stock: stock.serialize(),
        },
      })
    } catch (err) {
      if (err instanceof PendingStockEntryNotFoundError) {
        return response.notFound({ error: { code: err.code, message: err.message } })
      }
      if (err instanceof PendingStockEntryInvalidStateError) {
        return response.badRequest({ error: { code: err.code, message: err.message } })
      }
      throw err
    }
  }
}
