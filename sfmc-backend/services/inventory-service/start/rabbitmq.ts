import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { connectRabbitMQ } from '#services/rabbitmq'
import { startInventoryListeners } from '#listeners/inventory_listeners'

if (env.get('NODE_ENV') !== 'test') {
  connectRabbitMQ()
    .then(() => startInventoryListeners())
    .then(() => logger.info('[inventory] RabbitMQ consumers started'))
    .catch((err) => logger.error({ err }, '[inventory] RabbitMQ bootstrap failed'))
}
