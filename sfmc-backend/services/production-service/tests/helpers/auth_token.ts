import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import env from '#start/env'

/** JWT ADMIN / OPERATOR pour les tests fonctionnels HTTP (même secret que `JWT_SECRET`). */
export function bearerOperatorHeaders(): Record<string, string> {
  const token = jwt.sign(
    {
      sub: crypto.randomUUID(),
      email: 'operator@test.local',
      role: 'OPERATOR',
    },
    env.get('JWT_SECRET'),
    { expiresIn: '2h' }
  )
  return { Authorization: `Bearer ${token}` }
}
