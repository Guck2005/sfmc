import jwt from 'jsonwebtoken'
import { Kind, parse } from 'graphql'
import env from '#start/env'

export interface GraphqlAuthUser {
  id: string
  email: string
  role: string
}

export type JwtVerifyResult = GraphqlAuthUser | 'missing' | 'invalid'

/**
 * Détecte si la requête GraphQL est une mutation (pour appliquer JWT + ADMIN avant Apollo).
 */
export function isGraphqlMutation(query: string, operationName?: string | null): boolean {
  if (!query?.trim()) return false
  try {
    const doc = parse(query)
    const ops = doc.definitions.filter((d) => d.kind === Kind.OPERATION_DEFINITION)
    if (ops.length === 0) return false
    if (operationName) {
      const named = ops.find((o) => o.name?.value === operationName)
      if (!named) return false
      return named.operation === 'mutation'
    }
    return ops[0]!.operation === 'mutation'
  } catch {
    return false
  }
}

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
