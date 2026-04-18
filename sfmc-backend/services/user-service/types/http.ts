import type { UserRole } from '../app/models/user.js'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    auth: {
      id: string
      email: string
      role: UserRole
    }
  }
}
