import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Notification from '#models/notification'

/**
 * Quelques notifications fictives pour valider l’UI / l’API.
 */
export default class extends BaseSeeder {
  async run() {
    await Notification.updateOrCreate(
      { id: 'eeeeeeee-eeee-4eee-eeee-000000000001' },
      {
        id: 'eeeeeeee-eeee-4eee-eeee-000000000001',
        recipient: 'admin@sfmc.bj',
        type: 'ORDER_VALIDATED',
        channel: 'EMAIL',
        status: 'SENT',
        payload: JSON.stringify({ message: 'Démo : commande validée (fictif).' }),
      }
    )
    await Notification.updateOrCreate(
      { id: 'eeeeeeee-eeee-4eee-eeee-000000000002' },
      {
        id: 'eeeeeeee-eeee-4eee-eeee-000000000002',
        recipient: 'client@sfmc.bj',
        type: 'ORDER_SHIPPED',
        channel: 'SMS',
        status: 'PENDING',
        payload: JSON.stringify({ message: 'Démo : expédition à confirmer (fictif).' }),
      }
    )
  }
}
