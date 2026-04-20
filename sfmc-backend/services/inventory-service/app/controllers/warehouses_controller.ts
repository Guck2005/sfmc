import type { HttpContext } from '@adonisjs/core/http'
import Warehouse from '#models/warehouse'
import Stock from '#models/stock'
import vine from '@vinejs/vine'
import { randomUUID } from 'node:crypto'

export default class WarehousesController {
  async index({ response }: HttpContext) {
    const warehouses = await Warehouse.query().orderBy('name')
    return response.ok({ data: warehouses })
  }

  async show({ params, response }: HttpContext) {
    const warehouse = await Warehouse.findOrFail(params.id)
    return response.ok({ data: warehouse })
  }

  async create({ request, response }: HttpContext) {
    const schema = vine.object({
      name: vine.string().trim().minLength(2).maxLength(120),
      location: vine.string().trim().minLength(2).maxLength(200),
      capacity: vine.number().positive(),
    })
    const payload = await request.validateUsing(vine.compile(schema))
    const warehouse = await Warehouse.create({ id: randomUUID(), ...payload })
    return response.created({ data: warehouse })
  }

  async update({ params, request, response }: HttpContext) {
    const warehouse = await Warehouse.findOrFail(params.id)
    const schema = vine.object({
      name: vine.string().trim().minLength(2).maxLength(120).optional(),
      location: vine.string().trim().minLength(2).maxLength(200).optional(),
      capacity: vine.number().positive().optional(),
    })
    const payload = await request.validateUsing(vine.compile(schema))
    warehouse.merge(payload)
    await warehouse.save()
    return response.ok({ data: warehouse })
  }

  async destroy({ params, response }: HttpContext) {
    const warehouse = await Warehouse.findOrFail(params.id)

    const stockCount = await Stock.query().where('warehouseId', warehouse.id).count('* as total').first()
    const total = Number(stockCount?.$extras?.total ?? 0)
    if (total > 0) {
      return response.unprocessableEntity({
        error: {
          code: 'WAREHOUSE_NOT_EMPTY',
          message: `Impossible de supprimer un entrepôt contenant des stocks (${total} lignes).`,
        },
      })
    }

    await warehouse.delete()
    return response.noContent()
  }
}
