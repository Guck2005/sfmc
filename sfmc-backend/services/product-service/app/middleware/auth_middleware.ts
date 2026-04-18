import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import jwt from 'jsonwebtoken'
import env from '#start/env'

export default class AuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { request, response } = ctx
    const authHeader = request.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return response.unauthorized({ error: { code: 'MISSING_TOKEN', message: 'Token requis' } })
    }

    try {
      const token = authHeader.slice(7)
      const payload = jwt.verify(token, env.get('JWT_SECRET')) as {
        sub: string
        email: string
        role: string
      }
      ;(ctx as any).auth = { id: payload.sub, email: payload.email, role: payload.role }
    } catch {
      return response.unauthorized({ error: { code: 'INVALID_TOKEN', message: 'Token invalide' } })
    }

    return next()
  }
}
