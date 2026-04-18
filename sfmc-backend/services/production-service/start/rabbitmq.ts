import { connectRabbitMQ, consume } from '#services/rabbitmq'
import logger from '@adonisjs/core/services/logger'

export async function initRabbitMQ() {
  await connectRabbitMQ()

  const { onOrderProductionRequired, onOrderCancelled } = await import('#listeners/production_listeners')

  await consume({
    queue: 'production_q',
    routingKeys: ['order.production_required'],
    handler: onOrderProductionRequired,
  })

  await consume({
    queue: 'production.order.cancelled',
    routingKeys: ['order.cancelled'],
    handler: onOrderCancelled,
  })
}

initRabbitMQ().catch((err) => {
  logger.error(err, 'Failed to initialize RabbitMQ')
})
