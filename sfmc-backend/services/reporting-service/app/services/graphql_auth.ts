import jwt from 'jsonwebtoken'
import env from '#start/env'

export interface GraphqlAuthUser {
  id: string
  email: string
  role: string
}

export type JwtVerifyResult = GraphqlAuthUser | 'missing' | 'invalid'

/** Rôles autorisés pour les rapports / GraphQL reporting (back-office). */
export const REPORTING_ALLOWED_ROLES = ['ADMIN', 'OPERATOR'] as const

export function verifyJwtPayload(authHeader: string | undefined): JwtVerifyResult {
  if (!authHeader?.startsWith('Bearer ')) return 'missing'
  try {
    const token = authHeader.slice(7)
    const payload = jwt.verify(token, env.get('JWT_SECRET')) as {
      sub: string
      email: string
      role: string
    }
    return { id: payload.sub, email: payload.email, role: payload.role }
  } catch {
    return 'invalid'
  }
}

export function isReportingRole(role: string): boolean {
  return (REPORTING_ALLOWED_ROLES as readonly string[]).includes(role)
}

/** Connexion graphql-ws : `connectionParams.authorization` ou `Authorization`. */
export function verifyWsConnectionParams(
  params: Record<string, unknown> | undefined | null
): boolean {
  const raw = params?.authorization ?? params?.Authorization
  const authHeader = typeof raw === 'string' ? raw : undefined
  const auth = verifyJwtPayload(authHeader)
  if (auth === 'missing' || auth === 'invalid') return false
  return isReportingRole(auth.role)
}
