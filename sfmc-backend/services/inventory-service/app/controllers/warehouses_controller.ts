import type { HttpContext } from '@adonisjs/core/http'
import Warehouse from '#models/warehouse'

export default class WarehousesController {
  async index({ response }: HttpContext) {
    const warehouses = await Warehouse.query().orderBy('name')
    return response.ok({ data: warehouses })
  }

  async show({ params, response }: HttpContext) {
    const warehouse = await Warehouse.findOrFail(params.id)
    return response.ok({ data: warehouse })
  }
}
