import logger from '@adonisjs/core/services/logger'
import type { DomainEvent } from '@sfmc/shared-types'
import User from '#models/user'
import RefreshToken from '#models/refresh_token'

export interface UserRoleChangedPayload {
  userId: string
  oldRole?: 'ADMIN' | 'OPERATOR' | 'CLIENT'
  newRole: 'ADMIN' | 'OPERATOR' | 'CLIENT'
  changedBy?: string | null
}

/**
 * Apply a role change locally and revoke every refresh token belonging to the user.
 * Exposed separately from the event handler so it can be unit-tested without RabbitMQ.
 */
export async function applyRoleChange(
  userId: string,
  newRole: 'ADMIN' | 'OPERATOR' | 'CLIENT'
): Promise<{ userUpdated: boolean; tokensRevoked: number }> {
  const user = await User.find(userId)
  if (!user) {
    return { userUpdated: false, tokensRevoked: 0 }
  }

  if (user.role !== newRole) {
    user.role = newRole
    await user.save()
  }

  // Hard-revoke: force the user to log in again with a freshly-minted JWT that
  // carries the new role in its claims.
  const deleted = await RefreshToken.query().where('user_id', userId).delete()
  const tokensRevoked = Array.isArray(deleted) ? (deleted[0] as number) ?? 0 : Number(deleted) || 0

  return { userUpdated: true, tokensRevoked }
}

export async function onUserRoleChanged(event: DomainEvent): Promise<void> {
  const payload = event.payload as unknown as UserRoleChangedPayload
  if (!payload?.userId || !payload?.newRole) {
    logger.warn({ eventId: event.id }, '[auth] user.role_changed: payload invalide, ignoré')
    return
  }
  const result = await applyRoleChange(payload.userId, payload.newRole)
  logger.info(
    {
      eventId: event.id,
      userId: payload.userId,
      newRole: payload.newRole,
      ...result,
    },
    '[auth] user.role_changed: rôle synchronisé + refresh tokens révoqués'
  )
}
