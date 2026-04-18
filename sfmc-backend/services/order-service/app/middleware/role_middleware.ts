import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class RoleMiddleware {
  async handle(ctx: HttpContext, next: NextFn, allowedRoles: string[]) {
    const { response } = ctx
    const auth = (ctx as any).auth as { role?: string } | undefined
    if (!auth || !auth.role || !allowedRoles.includes(auth.role)) {
      return response.forbidden({
        error: { code: 'FORBIDDEN', message: 'Accès refusé pour ce rôle' },
      })
    }
    return next()
  }
}
