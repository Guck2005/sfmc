import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Machine from '#models/machine'

export default class MachineSeeder extends BaseSeeder {
  async run() {
    const machines = [
      { name: 'LIGNE-CIMENT-01', category: 'CIMENT' as const, status: 'AVAILABLE' as const },
      { name: 'LIGNE-FER-01', category: 'FER' as const, status: 'AVAILABLE' as const },
      { name: 'LIGNE-BRIQUES-01', category: 'BRIQUES' as const, status: 'AVAILABLE' as const },
    ]

    for (const m of machines) {
      const existing = await Machine.findBy('name', m.name)
      if (existing) continue
      await Machine.create(m)
    }
  }
}
