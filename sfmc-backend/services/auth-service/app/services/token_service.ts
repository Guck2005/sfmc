import jwt from 'jsonwebtoken'
import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import env from '#start/env'
import RefreshToken from '#models/refresh_token'
import User from '#models/user'

export interface JwtPayload {
  sub: string
  email: string
  role: string
  iat?: number
  exp?: number
}

export default class TokenService {
  generateAccessToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    }
    return jwt.sign(payload, env.get('JWT_SECRET'), {
      expiresIn: (env.get('JWT_EXPIRES_IN') as jwt.SignOptions['expiresIn']) ?? '15m',
    })
  }

  verifyAccessToken(token: string): JwtPayload {
    return jwt.verify(token, env.get('JWT_SECRET')) as JwtPayload
  }

  async generateRefreshToken(user: User): Promise<string> {
    const token = randomBytes(64).toString('hex')
    const expiresAt = DateTime.now().plus({
      days: env.get('REFRESH_TOKEN_EXPIRES_DAYS') ?? 7,
    })

    await RefreshToken.create({ userId: user.id, token, expiresAt })
    return token
  }

  async rotateRefreshToken(oldToken: string): Promise<{ user: User; newRefreshToken: string }> {
    const record = await RefreshToken.query()
      .where('token', oldToken)
      .preload('user')
      .firstOrFail()

    if (record.isExpired) {
      await record.delete()
      throw new Error('Refresh token expiré')
    }

    await record.delete()
    const newRefreshToken = await this.generateRefreshToken(record.user)
    return { user: record.user, newRefreshToken }
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await RefreshToken.query().where('token', token).delete()
  }
}
