import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Rate limiter in-memory (5 requests per IP per 15 min window).
 * NOTE: Per-process state — fine for dev / single pod. Migrate to Redis
 * before running multiple replicas in production.
 */
const WINDOW_MS = 15 * 60 * 1000
const MAX_REQUESTS = 5

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

function getKey(ctx: HttpContext): string {
  return ctx.request.ip() || 'unknown'
}

export default class ThrottleMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const key = getKey(ctx)
    const now = Date.now()
    const current = buckets.get(key)

    if (!current || current.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
      return next()
    }

    if (current.count >= MAX_REQUESTS) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
      ctx.response.header('Retry-After', String(retryAfterSeconds))
      ctx.response.header('X-RateLimit-Limit', String(MAX_REQUESTS))
      ctx.response.header('X-RateLimit-Remaining', '0')
      return ctx.response.tooManyRequests({
        error: 'Too many requests — rate limit exceeded',
        retryAfter: retryAfterSeconds,
      })
    }

    current.count += 1
    ctx.response.header('X-RateLimit-Limit', String(MAX_REQUESTS))
    ctx.response.header('X-RateLimit-Remaining', String(MAX_REQUESTS - current.count))
    return next()
  }
}
