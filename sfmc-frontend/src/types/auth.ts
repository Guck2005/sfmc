export type UserRole = 'ADMIN' | 'OPERATOR' | 'CLIENT'

/**
 * JWT émis par auth-service (token_service.ts).
 * Payload : `{ sub, email, role, iat, exp }`.
 */
export interface JwtPayload {
  sub: string
  email: string
  role: UserRole
  iat?: number
  exp: number
}

export interface AuthUser {
  id: string
  email: string
  role: UserRole
  fullName?: string | null
}

export interface LoginPayload {
  email: string
  password: string
}

/**
 * Forme normalisée retournée par `authService.login()`.
 * L'API backend renvoie `{ data: { accessToken, refreshToken, user } }` ;
 * le service se charge d'unwrapper.
 */
export interface LoginResponse {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresIn: number
  user: AuthUser
}

/**
 * Réponse brute du backend `POST /api/v1/auth/login`.
 * @internal
 */
export interface LoginApiEnvelope {
  data: {
    accessToken: string
    refreshToken: string
    tokenType: string
    expiresIn: number
    user: { id: string; email: string; role: UserRole }
  }
}
