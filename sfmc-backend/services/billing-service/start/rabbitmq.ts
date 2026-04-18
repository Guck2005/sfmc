import { connectRabbitMQ, consume } from '#services/rabbitmq'
import logger from '@adonisjs/core/services/logger'

export async function initRabbitMQ() {
  await connectRabbitMQ()

  const { onOrderValidated, onOrderCancelled } = await import('#listeners/billing_listeners')

  await consume({
    queue: 'billing.order_validated_q',
    routingKeys: ['order.validated'],
    handler: onOrderValidated,
  })

  await consume({
    queue: 'billing.order_cancelled_q',
    routingKeys: ['order.cancelled'],
    handler: onOrderCancelled,
  })
}

initRabbitMQ().catch((err) => {
  logger.error(err, 'Failed to initialize RabbitMQ')
})
