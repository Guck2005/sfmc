import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { connectRabbitMQ } from '#services/rabbitmq'
import { startOrderListeners } from '#listeners/order_listeners'

if (env.get('NODE_ENV') !== 'test') {
  connectRabbitMQ()
    .then(() => startOrderListeners())
    .then(() => logger.info('[order] RabbitMQ consumers started'))
    .catch((err) => logger.error({ err }, '[order] RabbitMQ bootstrap failed'))
}
