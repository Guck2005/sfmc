import type { HttpContext } from '@adonisjs/core/http'
import Stock from '#models/stock'
import StockMovement from '#models/stock_movement'
import {
  createMovementValidator,
  updateThresholdValidator,
  checkAvailabilityValidator,
  reserveValidator,
  releaseValidator,
} from '#validators/stock_validator'
import {
  recordMovement,
  reserveForOrder,
  releaseForOrder,
  computeAvailable,
  isCritical,
  InsufficientStockError,
} from '#services/stock_service'

export default class StocksController {
  /**
   * GET /api/v1/stocks
   */
  async index({ request, response }: HttpContext) {
    const warehouseId = request.input('warehouseId')
    const productId = request.input('productId')

    const query = Stock.query().orderBy('product_id').orderBy('warehouse_id')
    if (warehouseId) query.where('warehouse_id', warehouseId)
    if (productId) query.where('product_id', productId)

    const stocks = await query
    return response.ok({ data: stocks.map((s) => s.serialize()) })
  }

  /**
   * GET /api/v1/stocks/:productId/warehouses
   */
  async byProduct({ params, response }: HttpContext) {
    const stocks = await Stock.query().where('product_id', params.productId)
    return response.ok({ data: stocks.map((s) => s.serialize()) })
  }

  /**
   * POST /api/v1/stocks/movements
   */
  async createMovement(ctx: HttpContext) {
    const { request, response } = ctx
    const payload = await request.validateUsing(createMovementValidator)
    try {
      const movement = await recordMovement({
        stockId: payload.stockId,
        type: payload.type,
        quantity: payload.quantity,
        origin: payload.origin,
        referenceId: payload.referenceId ?? null,
        createdBy: (ctx as any).auth?.id ?? null,
      })
      return response.created({ data: movement })
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        return response.conflict({
          error: {
            code: err.code,
            message: err.message,
            details: { productId: err.productId, requested: err.requested, available: err.available },
          },
        })
      }
      throw err
    }
  }

  /**
   * GET /api/v1/stocks/movements
   */
  async listMovements({ request, response }: HttpContext) {
    const stockId = request.input('stockId')
    const type = request.input('type')
    const from = request.input('from')
    const to = request.input('to')

    const query = StockMovement.query().orderBy('date', 'desc')
    if (stockId) query.where('stock_id', stockId)
    if (type) query.where('type', type)
    if (from) query.where('date', '>=', from)
    if (to) query.where('date', '<=', to)

    const movements = await query.limit(500)
    return response.ok({ data: movements })
  }

  /**
   * GET /api/v1/stocks/alerts
   */
  async alerts({ response }: HttpContext) {
    const stocks = await Stock.query().whereRaw('(quantity - reserved) < threshold')
    return response.ok({ data: stocks.map((s) => s.serialize()) })
  }

  /**
   * PUT /api/v1/stocks/:id/threshold
   */
  async updateThreshold({ params, request, response }: HttpContext) {
    const payload = await request.validateUsing(updateThresholdValidator)
    const stock = await Stock.findOrFail(params.id)
    stock.threshold = payload.threshold
    await stock.save()
    return response.ok({ data: stock.serialize() })
  }

  /**
   * POST /api/v1/stocks/check-availability
   */
  async checkAvailability({ request, response }: HttpContext) {
    const payload = await request.validateUsing(checkAvailabilityValidator)
    const stocks = await Stock.query().where('product_id', payload.productId)
    const totalAvailable = stocks.reduce((sum, s) => sum + computeAvailable(s), 0)
    return response.ok({
      data: {
        available: totalAvailable >= payload.quantity,
        currentStock: totalAvailable,
        productId: payload.productId,
      },
    })
  }

  /**
   * POST /api/v1/stocks/reserve
   */
  async reserve({ request, response }: HttpContext) {
    const payload = await request.validateUsing(reserveValidator)
    try {
      const result = await reserveForOrder({ orderId: payload.orderId, lines: payload.lines })
      return response.ok({ data: { orderId: payload.orderId, ...result } })
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        return response.conflict({
          error: {
            code: err.code,
            message: err.message,
            details: { productId: err.productId, requested: err.requested, available: err.available },
          },
        })
      }
      throw err
    }
  }

  /**
   * POST /api/v1/stocks/release
   */
  async release({ request, response }: HttpContext) {
    const payload = await request.validateUsing(releaseValidator)
    await releaseForOrder({ orderId: payload.orderId, lines: payload.lines })
    return response.ok({ data: { orderId: payload.orderId, released: true } })
  }
}

export { isCritical }
