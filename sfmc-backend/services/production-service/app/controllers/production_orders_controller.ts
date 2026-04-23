import type { HttpContext } from '@adonisjs/core/http'
import ProductionOrder, { TERMINAL_PRODUCTION_STATUSES } from '#models/production_order'
import { publishEvent } from '#services/rabbitmq'
import {
  releaseMachineForProductionOrder,
  promoteQueuedProductionOrders,
} from '#services/production_planner'
import {
  publishProductionCompleted,
  publishProductionStatusChanged,
} from '#services/production_events'
import { randomUUID } from 'node:crypto'
import vine from '@vinejs/vine'
import logger from '@adonisjs/core/services/logger'

const PRODUCTION_STATUSES = [
  'PLANNED',
  'IN_PROGRESS',
  'QUALITY_CHECK',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const

async function releaseIfTerminal(po: ProductionOrder, newStatus: string): Promise<void> {
  if (TERMINAL_PRODUCTION_STATUSES.includes(newStatus as any) && po.machineId) {
    try {
      await releaseMachineForProductionOrder(po.id)
      await promoteQueuedProductionOrders()
    } catch (err) {
      logger.warn({ err, poId: po.id }, '[production] machine release failed')
    }
  }
}

export default class ProductionOrdersController {
  public async index({ request, response }: HttpContext) {
    const page = Number(request.input('page', 1))
    const limit = Math.min(Number(request.input('limit', 20)), 100)
    const status = request.input('status') as (typeof PRODUCTION_STATUSES)[number] | undefined
    const productId = request.input('productId') as string | undefined
    const orderId = request.input('orderId') as string | undefined

    const query = ProductionOrder.query().orderBy('createdAt', 'desc')
    if (status) query.where('status', status)
    if (productId) query.where('productId', productId)
    if (orderId) query.where('orderId', orderId)

    const result = await query.paginate(page, limit)
    return response.ok({
      data: result.all(),
      meta: {
        total: result.total,
        currentPage: result.currentPage,
        perPage: result.perPage,
        lastPage: result.lastPage,
      },
    })
  }

  public async show({ params, response }: HttpContext) {
    const order = await ProductionOrder.findOrFail(params.id)
    return response.ok({ data: order })
  }

  public async create({ request, response }: HttpContext) {
    const schema = vine.object({
      productId: vine.string().uuid(),
      quantity: vine.number().positive(),
      orderId: vine.string().uuid().optional(),
    })
    const payload = await request.validateUsing(vine.compile(schema))

    const order = await ProductionOrder.create({
      productId: payload.productId,
      quantity: payload.quantity,
      orderId: payload.orderId ?? null,
      status: 'PLANNED', // Explicit instead of default for clarity
    })

    return response.created({ data: order })
  }

  public async updateStatus({ params, request, response }: HttpContext) {
    const order = await ProductionOrder.findOrFail(params.id)

    const schema = vine.object({
      status: vine.enum(PRODUCTION_STATUSES),
    })
    const payload = await request.validateUsing(vine.compile(schema))

    const fromStatus = order.status
    order.status = payload.status
    await order.save()

    await releaseIfTerminal(order, payload.status)
    await publishProductionStatusChanged(order, fromStatus, payload.status)

    if (payload.status === 'COMPLETED' && fromStatus !== 'COMPLETED') {
      await publishProductionCompleted(order)
    }

    return response.ok({ data: order })
  }

  public async qualityControl({ params, request, response }: HttpContext) {
    const order = await ProductionOrder.findOrFail(params.id)

    const schema = vine.object({
      passed: vine.boolean(),
      notes: vine.string().optional(),
    })
    const payload = await request.validateUsing(vine.compile(schema))

    // Business Logic: Emit events based on quality inspection
    const fromQCStatus = order.status
    if (payload.passed) {
      order.status = 'COMPLETED'
      await order.save()
      await releaseIfTerminal(order, 'COMPLETED')
      await publishProductionStatusChanged(order, fromQCStatus, 'COMPLETED')
      await publishProductionCompleted(order, { notes: payload.notes })
    } else {
      order.status = 'REJECTED'
      await order.save()
      await releaseIfTerminal(order, 'REJECTED')
      await publishProductionStatusChanged(order, fromQCStatus, 'REJECTED')

      await publishEvent({
        id: randomUUID(),
        type: 'production.quality_failed',
        payload: {
          productionOrderId: order.id,
          orderId: order.orderId,
          productId: order.productId,
          quantity: order.quantity,
          reason: payload.notes || 'Échoué au contrôle qualité interne',
        },
        timestamp: new Date().toISOString(),
      })
    }

    return response.ok({ message: 'Quality control recorded', data: order })
  }
}
