import { BaseSeeder } from '@adonisjs/lucid/seeders'
import User from '#models/user'

/**
 * Seeder des comptes initiaux du back-office SFMC.
 *
 * Les UUIDs sont partagés avec `user-service/database/seeders/user_seeder.ts`
 * pour que `sub` du JWT corresponde à un profil existant côté user-service.
 *
 * Mots de passe en clair — le hook `@beforeSave` du modèle User se charge du
 * hash scrypt au moment de l'insert. Idempotent : relancer `node ace db:seed`
 * n'écrase pas les comptes existants (firstOrCreate).
 */
const SEED_USERS: Array<{
  id: string
  email: string
  password: string
  fullName: string
  role: 'ADMIN' | 'OPERATOR' | 'CLIENT'
}> = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-aaaa-000000000001',
    email: 'admin@sfmc.bj',
    password: 'Admin@2026',
    fullName: 'Admin SFMC',
    role: 'ADMIN',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-aaaa-000000000002',
    email: 'operator@sfmc.bj',
    password: 'Operator@2026',
    fullName: 'Opérateur Production',
    role: 'OPERATOR',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-aaaa-000000000003',
    email: 'client@sfmc.bj',
    password: 'Client@2026',
    fullName: 'Client Démo',
    role: 'CLIENT',
  },
]

export default class extends BaseSeeder {
  async run() {
    for (const seed of SEED_USERS) {
      await User.firstOrCreate(
        { email: seed.email },
        {
          id: seed.id,
          email: seed.email,
          password: seed.password,
          fullName: seed.fullName,
          role: seed.role,
          isActive: true,
        }
      )
    }
  }
}
