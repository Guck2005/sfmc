import type { HttpContext } from '@adonisjs/core/http'
import ProductionOrder from '#models/production_order'
import { publishEvent } from '#services/rabbitmq'
import { randomUUID } from 'node:crypto'
import vine from '@vinejs/vine'

export default class ProductionOrdersController {
  public async create({ request, response }: HttpContext) {
    const schema = vine.object({
      productId: vine.string().uuid(),
      quantity: vine.number().positive(),
      orderId: vine.string().uuid(),
    })
    const payload = await request.validateUsing(vine.compile(schema))

    const order = await ProductionOrder.create({
      productId: payload.productId,
      quantity: payload.quantity,
      orderId: payload.orderId,
      status: 'PLANNED', // Explicit instead of default for clarity
    })

    return response.created({ data: order })
  }

  public async updateStatus({ params, request, response }: HttpContext) {
    const order = await ProductionOrder.findOrFail(params.id)

    const schema = vine.object({
      status: vine.enum(['PLANNED', 'IN_PROGRESS', 'QUALITY_CHECK', 'COMPLETED', 'REJECTED', 'CANCELLED']),
    })
    const payload = await request.validateUsing(vine.compile(schema))

    order.status = payload.status
    await order.save()

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
    if (payload.passed) {
      order.status = 'COMPLETED'
      await order.save()

      await publishEvent({
        id: randomUUID(),
        type: 'production.completed',
        payload: {
          orderId: order.orderId,
          productId: order.productId,
          quantity: order.quantity,
          notes: payload.notes,
        },
        timestamp: new Date().toISOString(),
      })
    } else {
      order.status = 'REJECTED'
      await order.save()

      await publishEvent({
        id: randomUUID(),
        type: 'production.quality_failed',
        payload: {
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
