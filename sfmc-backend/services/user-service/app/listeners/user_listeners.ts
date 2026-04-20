import logger from '@adonisjs/core/services/logger'
import User from '#models/user'
import type { DomainEvent } from '#services/rabbitmq'

interface UserCreatedPayload {
  userId: string
  email: string
  fullName: string | null
  role: 'ADMIN' | 'OPERATOR' | 'CLIENT'
}

function splitFullName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  if (!fullName || fullName.trim().length === 0) {
    return { firstName: 'Utilisateur', lastName: '' }
  }
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' }
  }
  const [firstName, ...rest] = parts
  return { firstName, lastName: rest.join(' ') }
}

export async function onUserCreated(event: DomainEvent) {
  const payload = event.payload as UserCreatedPayload
  if (!payload?.userId || !payload?.email) {
    logger.warn({ event: event.id }, '[user] user.created: payload invalide, ignoré')
    return
  }

  const existing = await User.find(payload.userId)
  if (existing) {
    logger.debug({ userId: payload.userId }, '[user] user.created: profil déjà existant, skip')
    return
  }

  const { firstName, lastName } = splitFullName(payload.fullName)

  await User.create({
    id: payload.userId,
    email: payload.email,
    firstName,
    lastName,
    phone: null,
    role: payload.role,
    isActive: true,
  })

  logger.info({ userId: payload.userId, email: payload.email }, '[user] profil créé via user.created')
}

export async function onUserDeleted(event: DomainEvent) {
  const userId = (event.payload as { userId?: string })?.userId
  if (!userId) return
  const user = await User.find(userId)
  if (!user) return
  user.isActive = false
  await user.save()
  logger.info({ userId }, '[user] profil désactivé via user.deleted')
}
