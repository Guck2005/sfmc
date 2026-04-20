import { BaseSeeder } from '@adonisjs/lucid/seeders'
import User from '#models/user'

/**
 * Profils utilisateurs miroir des comptes auth-service.
 * Les UUIDs doivent correspondre à ceux de
 * `auth-service/database/seeders/user_seeder.ts`.
 */
const SEED_USERS: Array<{
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  role: 'ADMIN' | 'OPERATOR' | 'CLIENT'
}> = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-aaaa-000000000001',
    firstName: 'Admin',
    lastName: 'SFMC',
    email: 'admin@sfmc.bj',
    phone: '+22997000001',
    role: 'ADMIN',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-aaaa-000000000002',
    firstName: 'Opérateur',
    lastName: 'Production',
    email: 'operator@sfmc.bj',
    phone: '+22997000002',
    role: 'OPERATOR',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-aaaa-000000000003',
    firstName: 'Client',
    lastName: 'Démo',
    email: 'client@sfmc.bj',
    phone: '+22997000003',
    role: 'CLIENT',
  },
]

export default class extends BaseSeeder {
  async run() {
    for (const seed of SEED_USERS) {
      await User.firstOrCreate({ email: seed.email }, { ...seed, isActive: true })
    }
  }
}
