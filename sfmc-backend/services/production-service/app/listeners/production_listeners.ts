import ProductionOrder from '#models/production_order'
import ProcessedEvent from '#models/processed_event'
import logger from '@adonisjs/core/services/logger'
import {
  planProductionOrder,
  releaseMachineForProductionOrder,
  promoteQueuedProductionOrders,
} from '#services/production_planner'
import { publishProductionStatusChanged } from '#services/production_events'
import type { MachineCategory } from '#models/machine'

function normalizeCategory(raw: unknown): MachineCategory | null {
  if (typeof raw !== 'string') return null
  const up = raw.trim().toUpperCase()
  if (up === 'CIMENT' || up === 'FER' || up === 'BRIQUES' || up === 'GRANULATS') return up
  return null
}

export async function onOrderProductionRequired(event: any) {
  logger.info({ eventId: event.id }, '[production] received order.production_required')

  const alreadyProcessed = await ProcessedEvent.find(event.id)
  if (alreadyProcessed) {
    logger.info({ eventId: event.id }, '[production] event already processed, skipping')
    return
  }

  const payload = event.payload
  if (!payload.items || !Array.isArray(payload.items)) {
    logger.warn({ eventId: event.id }, '[production] missing items in payload')
    return
  }

  for (const item of payload.items) {
    const category = normalizeCategory(item.productCategory ?? item.category)
    const plan = await planProductionOrder({
      orderId: payload.orderId,
      productId: item.productId,
      quantity: Number(item.quantity),
      category,
    })
    await publishProductionStatusChanged(plan.productionOrder, null, plan.status)
    logger.info(
      {
        orderId: payload.orderId,
        productId: item.productId,
        poId: plan.productionOrder.id,
        status: plan.status,
        machineId: plan.machine?.id ?? null,
        reason: plan.reason,
      },
      '[production] planning decision'
    )
  }

  await ProcessedEvent.create({ eventId: event.id, eventType: event.type })
}

export async function onOrderCancelled(event: any) {
  logger.info({ eventId: event.id }, '[production] received order.cancelled')

  const alreadyProcessed = await ProcessedEvent.find(event.id)
  if (alreadyProcessed) {
    logger.info({ eventId: event.id }, '[production] event already processed, skipping')
    return
  }

  const payload = event.payload
  if (!payload.orderId) return

  const prodOrders = await ProductionOrder.query().where('orderId', payload.orderId)

  for (const po of prodOrders) {
    if (po.status === 'PLANNED' || po.status === 'IN_PROGRESS') {
      const fromStatus = po.status
      await releaseMachineForProductionOrder(po.id)
      po.status = 'CANCELLED'
      await po.save()
      await publishProductionStatusChanged(po, fromStatus, 'CANCELLED')
      logger.info(
        { poId: po.id, fromStatus },
        '[production] cancelled production order (machine released if any)'
      )
    } else {
      logger.warn(
        { poId: po.id, status: po.status },
        '[production] could not cancel production order (terminal state)'
      )
    }
  }

  // A released machine may now serve a queued PO.
  try {
    await promoteQueuedProductionOrders()
  } catch (err) {
    logger.warn({ err }, '[production] queue promotion failed')
  }

  await ProcessedEvent.create({ eventId: event.id, eventType: event.type })
}
