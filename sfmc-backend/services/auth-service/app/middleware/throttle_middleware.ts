import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { hitRateLimit } from '#services/rate_limiter'

/**
 * Distributed rate limiter middleware — 5 requests per IP per 15 min window.
 * State is held in Redis so all auth-service pods share the same counter,
 * making the limit enforced at the infrastructure level rather than per-pod.
 */
export default class ThrottleMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const ip = ctx.request.ip() || 'unknown'
    const result = await hitRateLimit(ip)

    ctx.response.header('X-RateLimit-Limit', String(result.limit))
    ctx.response.header('X-RateLimit-Remaining', String(result.remaining))

    if (!result.allowed) {
      ctx.response.header('Retry-After', String(result.retryAfterSeconds))
      return ctx.response.tooManyRequests({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests — rate limit exceeded',
        },
        retryAfter: result.retryAfterSeconds,
      })
    }

    return next()
  }
}
