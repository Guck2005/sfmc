import { connectRabbitMQ, consume } from '#services/rabbitmq'
import logger from '@adonisjs/core/services/logger'

export async function initRabbitMQ() {
  await connectRabbitMQ()

  const {
    onOrderValidated,
    onOrderShipped,
    onOrderDelivered,
    onOrderCancelled,
    onInventoryPendingReception,
    onProductionQualityFailed,
    onInventoryCritical,
    onBillingInvoiceCreated,
    onBillingInvoicePaid,
    onBillingCreditNoteCreated,
  } = await import('#listeners/notification_listeners')

  await consume({
    queue: 'notif.order_validated_q',
    routingKeys: ['order.validated'],
    handler: onOrderValidated,
  })

  await consume({
    queue: 'notif.order_shipped_q',
    routingKeys: ['order.shipped'],
    handler: onOrderShipped,
  })

  await consume({
    queue: 'notif.order_delivered_q',
    routingKeys: ['order.delivered'],
    handler: onOrderDelivered,
  })

  await consume({
    queue: 'notif.order_cancelled_q',
    routingKeys: ['order.cancelled'],
    handler: onOrderCancelled,
  })

  await consume({
    queue: 'notif.inventory_pending_reception_q',
    routingKeys: ['inventory.pending_reception'],
    handler: onInventoryPendingReception,
  })

  await consume({
    queue: 'notif.quality_failed_q',
    routingKeys: ['production.quality_failed'],
    handler: onProductionQualityFailed,
  })

  await consume({
    queue: 'notif.inventory_critical_q',
    routingKeys: ['inventory.critical'],
    handler: onInventoryCritical,
  })

  await consume({
    queue: 'notif.invoice_created_q',
    routingKeys: ['billing.invoice_created'],
    handler: onBillingInvoiceCreated,
  })

  await consume({
    queue: 'notif.invoice_paid_q',
    routingKeys: ['billing.invoice_paid'],
    handler: onBillingInvoicePaid,
  })

  await consume({
    queue: 'notif.credit_note_created_q',
    routingKeys: ['billing.credit_note_created'],
    handler: onBillingCreditNoteCreated,
  })
}

initRabbitMQ().catch((err) => {
  logger.error(err, 'Failed to initialize RabbitMQ')
})
