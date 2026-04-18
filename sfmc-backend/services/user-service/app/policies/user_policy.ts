import type { UserRole } from '#models/user'

export interface AuthorizedUser {
  id: string
  role: UserRole
}

export default class UserPolicy {
  list(actor: AuthorizedUser): boolean {
    return actor.role === 'ADMIN'
  }

  create(actor: AuthorizedUser): boolean {
    return actor.role === 'ADMIN'
  }

  view(actor: AuthorizedUser, targetUserId: string): boolean {
    return actor.role === 'ADMIN' || actor.id === targetUserId
  }

  update(actor: AuthorizedUser, targetUserId: string): boolean {
    return actor.role === 'ADMIN' || actor.id === targetUserId
  }

  delete(actor: AuthorizedUser): boolean {
    return actor.role === 'ADMIN'
  }

  updateRole(actor: AuthorizedUser): boolean {
    return actor.role === 'ADMIN'
  }
}
