import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * OWASP security headers (equivalent of @adonisjs/shield).
 * CSRF is intentionally NOT enforced: APIs are stateless JWT.
 */
export default class SecurityHeadersMiddleware {
  async handle({ response }: HttpContext, next: NextFn) {
    response.header('X-Frame-Options', 'DENY')
    response.header('X-Content-Type-Options', 'nosniff')
    response.header('Referrer-Policy', 'no-referrer')
    response.header('X-XSS-Protection', '1; mode=block')
    response.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'"
    )
    response.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    response.header(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=()'
    )
    return next()
  }
}
