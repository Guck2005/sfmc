// @sfmc/auth-middleware — Middleware JWT réutilisable

export interface JwtPayload {
  sub: string
  email: string
  role: string
  iat: number
  exp: number
}

export interface AuthenticatedUser {
  id: string
  email: string
  role: 'ADMIN' | 'OPERATOR' | 'CLIENT'
}

export function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return null
  }
  return authorizationHeader.slice(7)
}

export function hasRole(user: AuthenticatedUser, roles: string[]): boolean {
  return roles.includes(user.role)
}
