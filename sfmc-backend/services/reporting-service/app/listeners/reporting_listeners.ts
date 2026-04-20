import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import ReportOrder from '#models/report_order'
import ReportInvoice from '#models/report_invoice'
import ReportStockSnapshot from '#models/report_stock_snapshot'
import ReportProductionOrder from '#models/report_production_order'
import ProcessedEvent from '#models/processed_event'
import { pubsub, TOPICS, productionOrderTopic } from '../graphql/pubsub.js'
import { computeDashboardKPIs } from '#services/reporting_kpis'

async function broadcastOrderStatus(orderId: string, status: string) {
  pubsub.publish(TOPICS.ORDER_STATUS_UPDATED, {
    orderId,
    status,
    updatedAt: DateTime.now().toISO(),
  })
}

async function broadcastKpiUpdate() {
  try {
    const kpis = await computeDashboardKPIs()
    pubsub.publish(TOPICS.KPI_UPDATED, kpis)
  } catch (err) {
    logger.warn({ err }, '[reporting] failed to broadcast KPI update')
  }
}

async function alreadyProcessed(eventId: string): Promise<boolean> {
  const found = await ProcessedEvent.find(eventId)
  return !!found
}

async function markProcessed(eventId: string, eventType: string): Promise<void> {
  await ProcessedEvent.create({ eventId, eventType })
}

export async function onOrderCreated(event: any) {
  if (await alreadyProcessed(event.id)) return
  const p = event.payload ?? {}
  try {
    await ReportOrder.updateOrCreate(
      { orderId: p.orderId },
      {
        orderId: p.orderId,
        customerId: p.customerId ?? null,
        status: 'PENDING',
        totalAmount: Number(p.totalAmount ?? 0),
      }
    )
    await markProcessed(event.id, event.type)
    await broadcastOrderStatus(p.orderId, 'PENDING')
    await broadcastKpiUpdate()
    logger.info({ orderId: p.orderId }, '[reporting] order.created projected')
  } catch (err) {
    logger.error({ err }, '[reporting] onOrderCreated failed')
    throw err
  }
}

export async function onOrderValidated(event: any) {
  if (await alreadyProcessed(event.id)) return
  const p = event.payload ?? {}
  const existing = await ReportOrder.findBy('orderId', p.orderId)
  if (existing) {
    existing.status = 'VALIDATED'
    if (p.totalAmount) existing.totalAmount = Number(p.totalAmount)
    await existing.save()
  } else {
    await ReportOrder.create({
      orderId: p.orderId,
      customerId: p.customerId ?? null,
      status: 'VALIDATED',
      totalAmount: Number(p.totalAmount ?? 0),
    })
  }
  await markProcessed(event.id, event.type)
  await broadcastOrderStatus(p.orderId, 'VALIDATED')
  await broadcastKpiUpdate()
  logger.info({ orderId: p.orderId }, '[reporting] order.validated projected')
}

export async function onOrderCancelled(event: any) {
  if (await alreadyProcessed(event.id)) return
  const p = event.payload ?? {}
  const order = await ReportOrder.findBy('orderId', p.orderId)
  if (order) {
    order.status = 'CANCELLED'
    await order.save()
  }
  await markProcessed(event.id, event.type)
  await broadcastOrderStatus(p.orderId, 'CANCELLED')
  await broadcastKpiUpdate()
  logger.info({ orderId: p.orderId }, '[reporting] order.cancelled projected')
}

export async function onOrderShipped(event: any) {
  if (await alreadyProcessed(event.id)) return
  const p = event.payload ?? {}
  const order = await ReportOrder.findBy('orderId', p.orderId)
  if (order) {
    order.status = 'SHIPPED'
    await order.save()
  }
  await markProcessed(event.id, event.type)
  await broadcastOrderStatus(p.orderId, 'SHIPPED')
  logger.info({ orderId: p.orderId }, '[reporting] order.shipped projected')
}

export async function onOrderDelivered(event: any) {
  if (await alreadyProcessed(event.id)) return
  const p = event.payload ?? {}
  const order = await ReportOrder.findBy('orderId', p.orderId)
  if (order) {
    order.status = 'DELIVERED'
    await order.save()
  }
  await markProcessed(event.id, event.type)
  await broadcastOrderStatus(p.orderId, 'DELIVERED')
  await broadcastKpiUpdate()
  logger.info({ orderId: p.orderId }, '[reporting] order.delivered projected')
}

export async function onInvoiceCreated(event: any) {
  if (await alreadyProcessed(event.id)) return
  const p = event.payload ?? {}
  await ReportInvoice.updateOrCreate(
    { invoiceId: p.invoiceId },
    {
      invoiceId: p.invoiceId,
      orderId: p.orderId ?? null,
      amount: Number(p.amount ?? 0),
      status: p.status ?? 'PENDING',
      issuedAt: p.issuedAt ? DateTime.fromISO(p.issuedAt) : DateTime.now(),
    }
  )
  await markProcessed(event.id, event.type)
  await broadcastKpiUpdate()
  logger.info({ invoiceId: p.invoiceId }, '[reporting] invoice.created projected')
}

export async function onInventoryCritical(event: any) {
  if (await alreadyProcessed(event.id)) return
  const p = event.payload ?? {}
  await ReportStockSnapshot.create({
    productId: p.productId,
    warehouseId: p.warehouseId ?? null,
    quantity: Number(p.quantity ?? 0),
    reserved: Number(p.reserved ?? 0),
    threshold: Number(p.threshold ?? 0),
    isCritical: true,
    snapshotAt: DateTime.now(),
  })
  await markProcessed(event.id, event.type)
  logger.info({ productId: p.productId }, '[reporting] inventory.critical projected')
}

export async function onProductionCompleted(event: any) {
  if (await alreadyProcessed(event.id)) return
  const p = event.payload ?? {}
  const pid = p.productionOrderId ?? p.id
  const existing = await ReportProductionOrder.findBy('productionOrderId', pid)
  const nowStart = p.startedAt ? DateTime.fromISO(p.startedAt) : null
  const nowEnd = p.completedAt ? DateTime.fromISO(p.completedAt) : DateTime.now()
  if (existing) {
    existing.status = 'COMPLETED'
    existing.qualityPassed = p.qualityPassed ?? true
    if (nowStart) existing.startedAt = nowStart
    existing.completedAt = nowEnd
    await existing.save()
  } else {
    await ReportProductionOrder.create({
      productionOrderId: pid,
      productId: p.productId,
      status: 'COMPLETED',
      qualityPassed: p.qualityPassed ?? true,
      startedAt: nowStart,
      completedAt: nowEnd,
    })
  }
  await markProcessed(event.id, event.type)
  await broadcastKpiUpdate()
  logger.info({ productionOrderId: pid }, '[reporting] production.completed projected')
}

export async function onProductionStatusChanged(event: any) {
  if (await alreadyProcessed(event.id)) return
  const p = event.payload ?? {}
  const pid: string | undefined = p.productionOrderId
  if (!pid) return

  // Project to the aggregate table (create row on first sighting if absent).
  const existing = await ReportProductionOrder.findBy('productionOrderId', pid)
  if (existing) {
    existing.status = p.toStatus
    await existing.save()
  } else {
    await ReportProductionOrder.create({
      productionOrderId: pid,
      productId: p.productId,
      status: p.toStatus,
      qualityPassed: null,
      startedAt: null,
      completedAt: null,
    })
  }

  const progress = {
    productionOrderId: pid,
    orderId: p.orderId ?? null,
    productId: p.productId,
    machineId: p.machineId ?? null,
    fromStatus: p.fromStatus ?? null,
    toStatus: p.toStatus,
    changedAt: p.changedAt ?? DateTime.now().toISO(),
  }
  pubsub.publish(productionOrderTopic(pid), progress)
  pubsub.publish(TOPICS.PRODUCTION_ORDER_UPDATED_ALL, progress)

  await markProcessed(event.id, event.type)
  logger.info(
    { productionOrderId: pid, toStatus: p.toStatus },
    '[reporting] production.status_changed projected & broadcast'
  )
}

export async function onProductionQualityFailed(event: any) {
  if (await alreadyProcessed(event.id)) return
  const p = event.payload ?? {}
  const pid = p.productionOrderId ?? p.id
  const existing = await ReportProductionOrder.findBy('productionOrderId', pid)
  if (existing) {
    existing.status = 'QUALITY_FAILED'
    existing.qualityPassed = false
    await existing.save()
  } else {
    await ReportProductionOrder.create({
      productionOrderId: pid,
      productId: p.productId,
      status: 'QUALITY_FAILED',
      qualityPassed: false,
      startedAt: p.startedAt ? DateTime.fromISO(p.startedAt) : null,
      completedAt: null,
    })
  }
  await markProcessed(event.id, event.type)
  await broadcastKpiUpdate()
  logger.info({ productionOrderId: pid }, '[reporting] production.quality_failed projected')
}
