import { Redis } from 'ioredis'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'

type RedisClient = Redis

/**
 * Distributed rate limiter backed by Redis — works safely across multiple
 * auth-service pods (contrary to the previous in-process Map that each
 * replica reset independently, enabling trivial bypass by round-robin).
 *
 * Key   : ratelimit:login:{ip}
 * Value : integer counter (INCR)
 * TTL   : 900s (15 min), set on the first hit of a new window via EXPIRE NX
 */

const WINDOW_SECONDS = 15 * 60
const MAX_REQUESTS = 5

let client: RedisClient | null = null
let warnedUnavailable = false

function getClient(): RedisClient {
  if (client) return client
  const url = env.get('REDIS_URL')
  const instance: RedisClient = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    retryStrategy: (times: number) => Math.min(times * 200, 2000),
  })
  instance.on('error', (err: Error) => {
    if (!warnedUnavailable) {
      logger.error({ err }, '[rate_limiter] Redis connection error')
      warnedUnavailable = true
    }
  })
  instance.on('ready', () => {
    warnedUnavailable = false
    logger.info('[rate_limiter] Redis ready')
  })
  client = instance
  return instance
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  retryAfterSeconds: number
}

/**
 * Fail-open strategy: if Redis is unreachable we do NOT block legitimate
 * traffic, we log and return `allowed=true`. Caller decides how to react
 * if stricter policy is required.
 */
export async function hitRateLimit(ip: string): Promise<RateLimitResult> {
  const key = `ratelimit:login:${ip}`
  try {
    const redis = getClient()
    const count = await redis.incr(key)
    if (count === 1) {
      await redis.expire(key, WINDOW_SECONDS)
    }
    const ttl = await redis.ttl(key)
    const retryAfter = ttl > 0 ? ttl : WINDOW_SECONDS
    return {
      allowed: count <= MAX_REQUESTS,
      remaining: Math.max(0, MAX_REQUESTS - count),
      limit: MAX_REQUESTS,
      retryAfterSeconds: retryAfter,
    }
  } catch (err) {
    logger.error({ err, ip }, '[rate_limiter] Redis unavailable, failing open')
    return {
      allowed: true,
      remaining: MAX_REQUESTS,
      limit: MAX_REQUESTS,
      retryAfterSeconds: WINDOW_SECONDS,
    }
  }
}

/**
 * Testing helper — wipes the counter for a given IP so unit tests can reset
 * between assertions without waiting 15 minutes.
 */
export async function resetRateLimit(ip: string): Promise<void> {
  try {
    await getClient().del(`ratelimit:login:${ip}`)
  } catch {
    /* noop */
  }
}

export async function closeRateLimiter(): Promise<void> {
  if (client) {
    await client.quit().catch(() => {})
    client = null
  }
}

export const RATE_LIMIT_CONFIG = { WINDOW_SECONDS, MAX_REQUESTS }
