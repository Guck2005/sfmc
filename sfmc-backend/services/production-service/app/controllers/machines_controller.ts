import type { HttpContext } from '@adonisjs/core/http'
import Machine from '#models/machine'
import {
  createMachineValidator,
  updateMachineStatusValidator,
  isValidMachineTransition,
  MACHINE_STATUSES,
} from '#validators/machine_validator'

export default class MachinesController {
  public async index({ request, response }: HttpContext) {
    const status = request.input('status') as (typeof MACHINE_STATUSES)[number] | undefined
    const category = request.input('category') as string | undefined
    const page = Number(request.input('page', 1))
    const limit = Math.min(Number(request.input('limit', 50)), 100)

    const query = Machine.query().orderBy('name', 'asc')
    if (status) query.where('status', status)
    if (category) query.where('category', category)

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
    const machine = await Machine.findOrFail(params.id)
    return response.ok({ data: machine })
  }

  public async store({ request, response }: HttpContext) {
    const payload = await request.validateUsing(createMachineValidator)
    const machine = await Machine.create({
      name: payload.name,
      category: payload.category ?? null,
      status: payload.status ?? 'AVAILABLE',
    })
    return response.created({ data: machine })
  }

  public async updateStatus({ params, request, response }: HttpContext) {
    const machine = await Machine.findOrFail(params.id)
    const { status: nextStatus } = await request.validateUsing(updateMachineStatusValidator)

    if (!isValidMachineTransition(machine.status, nextStatus)) {
      return response.status(422).send({
        error: {
          code: 'INVALID_MACHINE_TRANSITION',
          message: `Transition interdite: ${machine.status} → ${nextStatus}`,
        },
      })
    }

    machine.status = nextStatus
    await machine.save()
    return response.ok({ data: machine })
  }
}
