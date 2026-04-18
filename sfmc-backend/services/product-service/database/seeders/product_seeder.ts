import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Product from '#models/product'

export default class extends BaseSeeder {
  async run() {
    await Product.updateOrCreateMany('name', [
      {
        id: '11111111-1111-4111-a111-111111111101',
        name: 'Ciment Portland CEM I 42.5',
        category: 'CIMENT',
        unit: 'sac 50kg',
        description: 'Ciment Portland ordinaire haute résistance, idéal pour constructions structurelles',
        unitPrice: 5500,
        isActive: true,
      },
      {
        id: '11111111-1111-4111-a111-111111111102',
        name: 'Ciment Portland CEM II 32.5',
        category: 'CIMENT',
        unit: 'sac 50kg',
        description: 'Ciment Portland composé, usage général',
        unitPrice: 4800,
        isActive: true,
      },
      {
        id: '11111111-1111-4111-a111-111111111103',
        name: 'Fer à béton HA 10mm',
        category: 'FER',
        unit: 'barre 12m',
        description: 'Barre haute adhérence diamètre 10mm, norme NF A 35-016',
        unitPrice: 3200,
        isActive: true,
      },
      {
        id: '11111111-1111-4111-a111-111111111104',
        name: 'Fer à béton HA 12mm',
        category: 'FER',
        unit: 'barre 12m',
        description: 'Barre haute adhérence diamètre 12mm',
        unitPrice: 4500,
        isActive: true,
      },
      {
        id: '11111111-1111-4111-a111-111111111105',
        name: 'Fer à béton HA 16mm',
        category: 'FER',
        unit: 'barre 12m',
        description: 'Barre haute adhérence diamètre 16mm',
        unitPrice: 7800,
        isActive: true,
      },
      {
        id: '11111111-1111-4111-a111-111111111106',
        name: 'Brique pleine 20x10x5',
        category: 'BRIQUES',
        unit: 'unité',
        description: 'Brique pleine standard, bonne résistance thermique',
        unitPrice: 120,
        isActive: true,
      },
      {
        id: '11111111-1111-4111-a111-111111111107',
        name: 'Brique creuse 20x10x10',
        category: 'BRIQUES',
        unit: 'unité',
        description: 'Brique creuse alvéolée, légère et isolante',
        unitPrice: 95,
        isActive: true,
      },
      {
        id: '11111111-1111-4111-a111-111111111108',
        name: 'Granulats 0/31.5 tout-venant',
        category: 'GRANULATS',
        unit: 'm³',
        description: 'Granulats concassés 0/31.5mm, remblai et fondations',
        unitPrice: 18000,
        isActive: true,
      },
      {
        id: '11111111-1111-4111-a111-111111111109',
        name: 'Sable fin 0/4 lavé',
        category: 'GRANULATS',
        unit: 'm³',
        description: 'Sable fin lavé pour mortier et enduits',
        unitPrice: 22000,
        isActive: true,
      },
      {
        id: '11111111-1111-4111-a111-111111111110',
        name: 'Gravier concassé 10/25',
        category: 'GRANULATS',
        unit: 'm³',
        description: 'Gravier concassé calibre 10/25mm pour béton',
        unitPrice: 25000,
        isActive: true,
      }
    ])
  }
}
