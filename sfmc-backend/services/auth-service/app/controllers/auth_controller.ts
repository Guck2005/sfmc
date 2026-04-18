import type { HttpContext } from '@adonisjs/core/http'
import hash from '@adonisjs/core/services/hash'
import User from '#models/user'
import TokenService from '#services/token_service'
import { loginValidator, refreshValidator } from '#validators/auth_validator'

const tokenService = new TokenService()

export default class AuthController {
  /**
   * POST /api/v1/auth/login
   * Authentification locale → JWT + Refresh Token
   */
  async login({ request, response }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)

    const user = await User.query().where('email', email).where('is_active', true).first()

    if (!user || !(await hash.verify(user.password, password))) {
      return response.unauthorized({
        error: { code: 'INVALID_CREDENTIALS', message: 'Email ou mot de passe incorrect' },
      })
    }

    const accessToken = tokenService.generateAccessToken(user)
    const refreshToken = await tokenService.generateRefreshToken(user)

    return response.ok({
      data: {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { id: user.id, email: user.email, role: user.role },
      },
    })
  }

  /**
   * POST /api/v1/auth/refresh
   * Renouvellement du token via refresh token
   */
  async refresh({ request, response }: HttpContext) {
    const { refreshToken } = await request.validateUsing(refreshValidator)

    try {
      const { user, newRefreshToken } = await tokenService.rotateRefreshToken(refreshToken)
      const accessToken = tokenService.generateAccessToken(user)

      return response.ok({
        data: { accessToken, refreshToken: newRefreshToken, tokenType: 'Bearer', expiresIn: 900 },
      })
    } catch {
      return response.unauthorized({
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token invalide ou expiré' },
      })
    }
  }

  /**
   * POST /api/v1/auth/logout
   * Révocation du refresh token
   */
  async logout({ request, response }: HttpContext) {
    const { refreshToken } = await request.validateUsing(refreshValidator)
    await tokenService.revokeRefreshToken(refreshToken)
    return response.ok({ data: { message: 'Déconnexion réussie' } })
  }

  /**
   * POST /api/v1/auth/validate
   * Validation du JWT pour usage inter-service
   */
  async validate({ request, response }: HttpContext) {
    const authHeader = request.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return response.unauthorized({
        error: { code: 'MISSING_TOKEN', message: 'Token manquant' },
      })
    }

    const token = authHeader.slice(7)
    try {
      const payload = tokenService.verifyAccessToken(token)
      return response.ok({
        data: { valid: true, userId: payload.sub, email: payload.email, role: payload.role },
      })
    } catch {
      return response.unauthorized({
        error: { code: 'INVALID_TOKEN', message: 'Token invalide ou expiré' },
      })
    }
  }

  /**
   * GET /api/v1/auth/oauth/authorize
   * Stub — flux OAuth2 Authorization Code
   */
  async oauthAuthorize({ request, response }: HttpContext) {
    const { client_id, redirect_uri, state } = request.qs()
    return response.ok({
      data: { message: 'OAuth2 authorize stub', clientId: client_id, redirectUri: redirect_uri, state },
    })
  }

  /**
   * POST /api/v1/auth/oauth/token
   * Stub — échange code → access token
   */
  async oauthToken({ response }: HttpContext) {
    return response.ok({
      data: { message: 'OAuth2 token stub — à implémenter en Sprint 4' },
    })
  }
}
