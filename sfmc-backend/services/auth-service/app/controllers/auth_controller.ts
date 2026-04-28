import type { HttpContext } from '@adonisjs/core/http'
import hash from '@adonisjs/core/services/hash'
import { DateTime } from 'luxon'
import { randomBytes, randomUUID } from 'node:crypto'
import User from '#models/user'
import OauthClient from '#models/oauth_client'
import OauthAuthorizationCode from '#models/oauth_authorization_code'
import TokenService from '#services/token_service'
import { loginValidator, refreshValidator, registerValidator } from '#validators/auth_validator'
import { publishEvent } from '#services/rabbitmq'

const tokenService = new TokenService()

/**
 * OAuth2 Authorization Code grant — TTL of the generated code.
 */
const AUTHORIZATION_CODE_TTL_MINUTES = 10

export default class AuthController {
  /**
   * POST /api/v1/auth/register
   * Inscription publique (par défaut role=CLIENT). Si l'appelant est ADMIN
   * (token Bearer), un role peut être précisé (ADMIN/OPERATOR/CLIENT).
   *
   * Émet un événement `user.created` sur RabbitMQ pour que les autres
   * services (user-service) provisionnent leur propre profil.
   */
  async register({ request, response }: HttpContext) {
    const payload = await request.validateUsing(registerValidator)

    let requestedRole: 'ADMIN' | 'OPERATOR' | 'CLIENT' = 'CLIENT'
    if (payload.role) {
      const authHeader = request.header('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const caller = tokenService.verifyAccessToken(authHeader.slice(7))
          if (caller.role === 'ADMIN') {
            requestedRole = payload.role
          }
        } catch {
          // token invalide → role par défaut
        }
      }
    }

    const existing = await User.query().where('email', payload.email).first()
    if (existing) {
      return response.conflict({
        error: { code: 'EMAIL_ALREADY_USED', message: 'Cet email est déjà utilisé' },
      })
    }

    const user = await User.create({
      id: randomUUID(),
      email: payload.email,
      password: payload.password,
      fullName: payload.fullName ?? null,
      role: requestedRole,
      isActive: true,
    })

    await publishEvent({
      id: randomUUID(),
      type: 'user.created',
      version: '1.0',
      timestamp: new Date().toISOString(),
      payload: {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      metadata: {
        sourceService: 'auth-service',
        correlationId: randomUUID(),
      },
    })

    const accessToken = tokenService.generateAccessToken(user)
    const refreshToken = await tokenService.generateRefreshToken(user)

    return response.created({
      data: {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName },
      },
    })
  }

  /**
   * POST /api/v1/auth/login
   * Authentification locale → JWT + Refresh Token
   */
  async login({request, response }: HttpContext) {
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

  async loginSocial({ ally, response }: HttpContext) {
    try {
      const googleUser = await ally.use('google').user() ?? null
      let user = await User.query().where('email', googleUser.email).where('is_active', true).first()

      let requestedRole: 'ADMIN' | 'OPERATOR' | 'CLIENT' = 'CLIENT'
      if(!user)
      {
        user = await User.create({
          id: randomUUID(),
          email: googleUser.email,
          password: googleUser.email,
          fullName: googleUser.name ?? null,
          role: requestedRole,
          isActive: true,
        })
      }

      const accessToken = tokenService.generateAccessToken(user)
      const refreshToken = await tokenService.generateRefreshToken(user)

      return response.redirect(
        `http://localhost:5173/auth/success?accessToken=${accessToken}&refreshToken=${refreshToken}&email=${user.email}&role=${user.role}&id=${user.id}`
      )
    } catch (error) {
       return response.internalServerError({
        error: { code: 'ERREUR_INTERNE', message: error.message },
      })
    }

    /* return response.ok({
      data: {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { id: user.id, email: user.email, role: user.role },
      },
    }) */
  }

  /**
   * POST /api/v1/auth/refresh
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
   */
  async logout({ request, response }: HttpContext) {
    const { refreshToken } = await request.validateUsing(refreshValidator)
    await tokenService.revokeRefreshToken(refreshToken)
    return response.ok({ data: { message: 'Déconnexion réussie' } })
  }

  /**
   * POST /api/v1/auth/validate
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
   *
   * Authorization Code grant — step 1. This endpoint is typically reached
   * AFTER the user has signed in (consent screen). For an API-first backend
   * we accept the authenticated user id either from a bound session (not
   * implemented here) or from the `user_id` query parameter supplied by the
   * front-end that performed the prior interactive login.
   *
   * Redirects to `redirect_uri?code=…&state=…`.
   */
  async oauthAuthorize({ request, response }: HttpContext) {
    const qs = request.qs()
    const clientId = String(qs.client_id ?? '')
    const redirectUri = String(qs.redirect_uri ?? '')
    const responseType = String(qs.response_type ?? '')
    const state = qs.state ? String(qs.state) : ''
    const userId = String(qs.user_id ?? '')
    const scope = qs.scope ? String(qs.scope) : null

    if (!clientId || !redirectUri || !userId) {
      return response.badRequest({
        error: {
          code: 'INVALID_REQUEST',
          message: 'client_id, redirect_uri et user_id sont requis',
        },
      })
    }
    if (responseType !== 'code') {
      return response.badRequest({
        error: { code: 'UNSUPPORTED_RESPONSE_TYPE', message: 'response_type doit être "code"' },
      })
    }

    const client = await OauthClient.query()
      .where('clientId', clientId)
      .where('isActive', true)
      .first()
    if (!client) {
      return response.unauthorized({
        error: { code: 'UNAUTHORIZED_CLIENT', message: 'Client OAuth inconnu' },
      })
    }
    if (client.redirectUri !== redirectUri) {
      return response.badRequest({
        error: { code: 'REDIRECT_URI_MISMATCH', message: 'redirect_uri ne correspond pas' },
      })
    }

    const user = await User.find(userId)
    if (!user || !user.isActive) {
      return response.unauthorized({
        error: { code: 'INVALID_USER', message: 'Utilisateur inconnu ou inactif' },
      })
    }

    const code = randomBytes(32).toString('hex')
    await OauthAuthorizationCode.create({
      code,
      clientId,
      redirectUri,
      userId: user.id,
      scope,
      expiresAt: DateTime.now().plus({ minutes: AUTHORIZATION_CODE_TTL_MINUTES }),
      used: false,
    })

    const separator = redirectUri.includes('?') ? '&' : '?'
    const location = `${redirectUri}${separator}code=${encodeURIComponent(code)}${
      state ? `&state=${encodeURIComponent(state)}` : ''
    }`
    return response.redirect(location)
  }

  /**
   * POST /api/v1/auth/oauth/token
   *
   * Exchanges an authorization code for a Bearer access_token (JWT).
   * Expected body:
   *   { grant_type, code, client_id, client_secret, redirect_uri }
   */
  async oauthToken({ request, response }: HttpContext) {
    const body = request.body()
    const grantType = String(body.grant_type ?? '')
    const code = String(body.code ?? '')
    const clientId = String(body.client_id ?? '')
    const clientSecret = String(body.client_secret ?? '')
    const redirectUri = String(body.redirect_uri ?? '')

    if (grantType !== 'authorization_code') {
      return response.badRequest({
        error: { code: 'UNSUPPORTED_GRANT_TYPE', message: 'grant_type non supporté' },
      })
    }
    if (!code || !clientId || !clientSecret || !redirectUri) {
      return response.badRequest({
        error: {
          code: 'INVALID_REQUEST',
          message: 'code, client_id, client_secret, redirect_uri requis',
        },
      })
    }

    const client = await OauthClient.query()
      .where('clientId', clientId)
      .where('isActive', true)
      .first()
    if (!client || client.clientSecret !== clientSecret) {
      return response.unauthorized({
        error: { code: 'INVALID_CLIENT', message: 'Identifiants client invalides' },
      })
    }
    if (client.redirectUri !== redirectUri) {
      return response.badRequest({
        error: { code: 'REDIRECT_URI_MISMATCH', message: 'redirect_uri invalide' },
      })
    }

    const authCode = await OauthAuthorizationCode.query().where('code', code).first()
    if (!authCode) {
      return response.badRequest({
        error: { code: 'INVALID_GRANT', message: 'Code d\'autorisation inconnu' },
      })
    }
    if (authCode.used) {
      return response.badRequest({
        error: { code: 'INVALID_GRANT', message: 'Code déjà utilisé' },
      })
    }
    if (authCode.clientId !== clientId || authCode.redirectUri !== redirectUri) {
      return response.badRequest({
        error: { code: 'INVALID_GRANT', message: 'Code délivré pour un autre client' },
      })
    }
    if (authCode.isExpired) {
      return response.badRequest({
        error: { code: 'INVALID_GRANT', message: 'Code expiré' },
      })
    }

    authCode.used = true
    authCode.usedAt = DateTime.now()
    await authCode.save()

    const user = await User.findOrFail(authCode.userId)
    const accessToken = tokenService.generateAccessToken(user)

    return response.ok({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: authCode.scope ?? undefined,
    })
  }
}
