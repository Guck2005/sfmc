import { connectRabbitMQ, consume } from '#services/rabbitmq'
import logger from '@adonisjs/core/services/logger'

export async function initRabbitMQ() {
  await connectRabbitMQ()

  const {
    onOrderValidated,
    onOrderShipped,
    onOrderCancelled,
    onProductionQualityFailed,
    onInventoryCriticalStock,
  } = await import('#listeners/notification_listeners')

  await consume({
    queue: 'notif.order_validated_q',
    routingKeys: ['order.validated'],
    handler: onOrderValidated,
  })

  await consume({
    queue: 'notif.order_cancelled_q',
    routingKeys: ['order.cancelled'],
    handler: onOrderCancelled,
  })

  await consume({
    queue: 'notif.order_shipped_q',
    routingKeys: ['order.shipped'],
    handler: onOrderShipped,
  })

  await consume({
    queue: 'notif.quality_failed_q',
    routingKeys: ['production.quality_failed'],
    handler: onProductionQualityFailed,
  })

  await consume({
    queue: 'notif.critical_stock_q',
    routingKeys: ['inventory.critical_stock'],
    handler: onInventoryCriticalStock,
  })
}

initRabbitMQ().catch((err) => {
  logger.error(err, 'Failed to initialize RabbitMQ')
})
