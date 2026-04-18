import type { HttpContext } from '@adonisjs/core/http'
import Order from '#models/order'
import {
  createOrder,
  cancelOrder,
  transitionStatus,
  ServiceUnavailableError,
  InsufficientStockError,
} from '#services/order_service'
import { InvalidTransitionError } from '#services/order_state_machine'
import { createOrderValidator, updateStatusValidator } from '#validators/order_validator'

export default class OrdersController {
  /**
   * POST /api/v1/orders — déclenche la Saga
   */
  async store({ request, response }: HttpContext) {
    const payload = await request.validateUsing(createOrderValidator)
    try {
      const order = await createOrder(payload)
      return response.created({ data: order })
    } catch (err) {
      if (err instanceof ServiceUnavailableError) {
        return response.serviceUnavailable({
          error: { code: err.code, message: err.message },
        })
      }
      if (err instanceof InsufficientStockError) {
        return response.conflict({
          error: {
            code: err.code,
            message: err.message,
            details: {
              productId: err.productId,
              requested: err.requested,
              available: err.available,
            },
          },
        })
      }
      throw err
    }
  }

  /**
   * GET /api/v1/orders
   */
  async index({ request, response }: HttpContext) {
    const page = request.input('page', 1)
    const limit = request.input('limit', 20)
    const status = request.input('status')
    const customerId = request.input('customerId')

    const query = Order.query().orderBy('created_at', 'desc')
    if (status) query.where('status', status)
    if (customerId) query.where('customer_id', customerId)

    const orders = await query.paginate(page, limit)
    return response.ok({
      data: orders.all(),
      meta: { total: orders.total, page: orders.currentPage, lastPage: orders.lastPage },
    })
  }

  /**
   * GET /api/v1/orders/:id
   */
  async show({ params, response }: HttpContext) {
    const order = await Order.query().where('id', params.id).preload('lines').firstOrFail()
    return response.ok({ data: order })
  }

  /**
   * PUT /api/v1/orders/:id/status
   */
  async updateStatus({ params, request, response }: HttpContext) {
    const payload = await request.validateUsing(updateStatusValidator)
    try {
      const order = await transitionStatus(params.id, payload.status)
      return response.ok({ data: order })
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        return response.unprocessableEntity({
          error: { code: err.code, message: err.message },
        })
      }
      throw err
    }
  }

  /**
   * DELETE /api/v1/orders/:id — annulation + compensation Saga
   */
  async destroy({ params, response }: HttpContext) {
    try {
      const order = await cancelOrder(params.id)
      return response.ok({ data: order })
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        return response.unprocessableEntity({
          error: { code: err.code, message: err.message },
        })
      }
      throw err
    }
  }
}
