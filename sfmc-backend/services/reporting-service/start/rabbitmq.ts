import { connectRabbitMQ, consume } from '#services/rabbitmq'
import logger from '@adonisjs/core/services/logger'

export async function initRabbitMQ() {
  await connectRabbitMQ()

  const {
    onOrderCreated,
    onOrderValidated,
    onOrderCancelled,
    onOrderShipped,
    onOrderDelivered,
    onInvoiceCreated,
    onInventoryCritical,
    onProductionCompleted,
    onProductionQualityFailed,
    onProductionStatusChanged,
  } = await import('#listeners/reporting_listeners')

  const wiring: Array<{
    queue: string
    routingKeys: string[]
    handler: (e: any) => Promise<void>
  }> = [
    { queue: 'reporting.order_created_q', routingKeys: ['order.created'], handler: onOrderCreated },
    {
      queue: 'reporting.order_validated_q',
      routingKeys: ['order.validated'],
      handler: onOrderValidated,
    },
    {
      queue: 'reporting.order_cancelled_q',
      routingKeys: ['order.cancelled'],
      handler: onOrderCancelled,
    },
    { queue: 'reporting.order_shipped_q', routingKeys: ['order.shipped'], handler: onOrderShipped },
    {
      queue: 'reporting.order_delivered_q',
      routingKeys: ['order.delivered'],
      handler: onOrderDelivered,
    },
    {
      queue: 'reporting.invoice_created_q',
      routingKeys: ['invoice.created'],
      handler: onInvoiceCreated,
    },
    {
      queue: 'reporting.inventory_critical_q',
      routingKeys: ['inventory.critical', 'inventory.low_stock'],
      handler: onInventoryCritical,
    },
    {
      queue: 'reporting.production_completed_q',
      routingKeys: ['production.completed'],
      handler: onProductionCompleted,
    },
    {
      queue: 'reporting.production_quality_failed_q',
      routingKeys: ['production.quality_failed'],
      handler: onProductionQualityFailed,
    },
    {
      queue: 'reporting.production_status_changed_q',
      routingKeys: ['production.status_changed'],
      handler: onProductionStatusChanged,
    },
  ]

  for (const w of wiring) {
    await consume(w)
  }
}

initRabbitMQ().catch((err) => {
  logger.error(err, 'Failed to initialize RabbitMQ (reporting)')
})
