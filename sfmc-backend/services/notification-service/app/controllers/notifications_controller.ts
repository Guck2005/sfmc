import type { HttpContext } from '@adonisjs/core/http'
import Notification from '#models/notification'

const NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'FAILED'] as const

export default class NotificationsController {
  /**
   * GET /api/v1/notifications
   * Liste paginée avec filtres (status, channel, recipient, type).
   */
  public async index({ request, response }: HttpContext) {
    const page = Number(request.input('page', 1))
    const limit = Math.min(Number(request.input('limit', 20)), 100)
    const status = request.input('status') as (typeof NOTIFICATION_STATUSES)[number] | undefined
    const channel = request.input('channel') as string | undefined
    const recipient = request.input('recipient') as string | undefined
    const type = request.input('type') as string | undefined

    const query = Notification.query().orderBy('createdAt', 'desc')
    if (status) query.where('status', status)
    if (channel) query.where('channel', channel)
    if (recipient) query.where('recipient', recipient)
    if (type) query.where('type', type)

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

  /**
   * GET /api/v1/notifications/:id
   */
  public async show({ params, response }: HttpContext) {
    const notification = await Notification.findOrFail(params.id)
    return response.ok({ data: notification })
  }
}
