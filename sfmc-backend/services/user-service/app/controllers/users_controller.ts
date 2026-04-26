import type { HttpContext } from '@adonisjs/core/http'
import type { AuthorizedUser } from '#policies/user_policy'
import { randomUUID } from 'node:crypto'
import User from '#models/user'
import UserPolicy from '#policies/user_policy'
import { publishEvent } from '#services/rabbitmq'
import {
  createUserValidator,
  updateUserValidator,
  updateRoleValidator,
} from '#validators/user_validator'

const policy = new UserPolicy()

function actor(ctx: HttpContext): AuthorizedUser {
  return (ctx as any).auth as AuthorizedUser
}

export default class UsersController {
  async index(ctx: HttpContext) {
    const { request, response } = ctx
    if (!policy.list(actor(ctx))) {
      return response.forbidden({ error: { code: 'FORBIDDEN', message: 'Accès refusé' } })
    }

    const page = request.input('page', 1)
    const limit = request.input('limit', 20)
    const roleFilter = request.input('role') as string | undefined
    const q = User.query().where('is_active', true).orderBy('created_at', 'desc')
    if (roleFilter === 'ADMIN' || roleFilter === 'OPERATOR' || roleFilter === 'CLIENT') {
      q.where('role', roleFilter)
    }
    const users = await q.paginate(page, limit)

    return response.ok({
      data: users.all(),
      meta: { total: users.total, page: users.currentPage, lastPage: users.lastPage },
    })
  }

  async store(ctx: HttpContext) {
    const { request, response } = ctx
    if (!policy.create(actor(ctx))) {
      return response.forbidden({ error: { code: 'FORBIDDEN', message: 'Accès refusé' } })
    }

    const payload = await request.validateUsing(createUserValidator)

    const existing = await User.findBy('email', payload.email)
    if (existing) {
      return response.conflict({
        error: { code: 'EMAIL_TAKEN', message: 'Cet email est déjà utilisé' },
      })
    }

    const user = await User.create({
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      phone: payload.phone ?? null,
      role: payload.role ?? 'CLIENT',
    })

    return response.created({ data: user })
  }

  async show(ctx: HttpContext) {
    const { params, response } = ctx
    if (!policy.view(actor(ctx), params.id)) {
      return response.forbidden({ error: { code: 'FORBIDDEN', message: 'Accès refusé' } })
    }

    const user = await User.findOrFail(params.id)
    return response.ok({ data: user })
  }

  async update(ctx: HttpContext) {
    const { params, request, response } = ctx
    if (!policy.update(actor(ctx), params.id)) {
      return response.forbidden({ error: { code: 'FORBIDDEN', message: 'Accès refusé' } })
    }

    const user = await User.findOrFail(params.id)
    const payload = await request.validateUsing(updateUserValidator)
    user.merge(payload)
    await user.save()

    return response.ok({ data: user })
  }

  async destroy(ctx: HttpContext) {
    const { params, response } = ctx
    if (!policy.delete(actor(ctx))) {
      return response.forbidden({ error: { code: 'FORBIDDEN', message: 'Accès refusé' } })
    }

    const user = await User.findOrFail(params.id)
    user.isActive = false
    await user.save()

    return response.ok({ data: { message: 'Utilisateur désactivé', id: user.id } })
  }

  async updateRole(ctx: HttpContext) {
    const { params, request, response } = ctx
    if (!policy.updateRole(actor(ctx))) {
      return response.forbidden({ error: { code: 'FORBIDDEN', message: 'Accès refusé' } })
    }

    const user = await User.findOrFail(params.id)
    const { role } = await request.validateUsing(updateRoleValidator)
    const oldRole = user.role
    user.role = role
    await user.save()

    if (oldRole !== role) {
      await publishEvent({
        id: randomUUID(),
        type: 'user.role_changed',
        timestamp: new Date().toISOString(),
        payload: {
          userId: user.id,
          oldRole,
          newRole: role,
          changedBy: actor(ctx)?.id ?? null,
        },
      })
    }

    return response.ok({ data: user })
  }
}
