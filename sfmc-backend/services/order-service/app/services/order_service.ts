import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Order, { type OrderStatus } from '#models/order'
import OrderLine from '#models/order_line'
import SagaLog from '#models/saga_log'
import ProcessedEvent from '#models/processed_event'
import { canTransition, InvalidTransitionError } from '#services/order_state_machine'
import { publishEvent } from '#services/rabbitmq'
import { checkAvailability } from '#services/inventory_client'
import type { DomainEvent } from '@sfmc/shared-types'
import {
  type OrderCreatedPayload,
  type OrderCancelledPayload,
  type OrderValidatedPayload,
} from '@sfmc/event-contracts'

export const SERVICE_NAME = 'order-service'

function createEvent<T extends Record<string, unknown>>(
  type: string,
  payload: T,
  sourceService: string,
  sagaId?: string,
  correlationId?: string
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type,
    version: '1.0',
    timestamp: new Date().toISOString(),
    payload,
    metadata: {
      sourceService,
      correlationId: correlationId ?? crypto.randomUUID(),
      ...(sagaId ? { sagaId } : {}),
    },
  }
}

export class ServiceUnavailableError extends Error {
  public readonly code = 'INVENTORY_UNAVAILABLE'
  constructor() {
    super('Le service inventaire est momentanément indisponible')
  }
}

export class InsufficientStockError extends Error {
  public readonly code = 'INSUFFICIENT_STOCK'
  constructor(
    public productId: string,
    public requested: number,
    public available: number
  ) {
    super(`Stock insuffisant pour le produit ${productId}`)
  }
}

export interface CreateOrderInput {
  customerId: string
  lines: Array<{ productId: string; quantity: number; unitPrice: number }>
}

async function createPendingOrder(input: CreateOrderInput, totalAmount: number): Promise<Order> {
  return await db.transaction(async (trx) => {
    const order = await Order.create(
      {
        customerId: input.customerId,
        status: 'PENDING',
        sagaStatus: 'PENDING',
        totalAmount,
      },
      { client: trx }
    )

    for (const line of input.lines) {
      await OrderLine.create(
        {
          orderId: order.id,
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        },
        { client: trx }
      )
    }

    await SagaLog.create(
      {
        sagaId: order.id,
        sagaType: 'order_creation',
        step: 'order_created',
        status: 'PENDING',
        payload: { orderId: order.id, customerId: order.customerId } as Record<string, unknown>,
      },
      { client: trx }
    )

    return order
  })
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const totalAmount = input.lines.reduce(
    (sum, l) => sum + Number(l.unitPrice) * Number(l.quantity),
    0
  )
  const order = await createPendingOrder(input, totalAmount)

  for (const line of input.lines) {
    const result = await checkAvailability({ productId: line.productId, quantity: line.quantity })
    if (result === null) {
      await cancelOrderFromSaga(order.id, 'inventory_service_unavailable', order.id)
      throw new ServiceUnavailableError()
    }
    if (!result.available) {
      await cancelOrderFromSaga(order.id, 'stock_insufficient', order.id)
      throw new InsufficientStockError(line.productId, line.quantity, result.currentStock)
    }
  }

  const payload: OrderCreatedPayload = {
    orderId: order.id,
    customerId: order.customerId,
    lines: input.lines,
    totalAmount,
  }
  await publishEvent(
    createEvent(
      'order.created',
      payload as unknown as Record<string, unknown>,
      SERVICE_NAME,
      order.id
    )
  )

  return order
}

export async function transitionStatus(
  orderId: string,
  to: OrderStatus
): Promise<Order> {
  const order = await Order.findOrFail(orderId)
  if (!canTransition(order.status, to)) {
    throw new InvalidTransitionError(order.status, to)
  }
  order.status = to
  await order.save()
  return order
}

export async function cancelOrder(orderId: string, reason = 'manual_cancellation'): Promise<Order> {
  const order = await Order.query().where('id', orderId).preload('lines').firstOrFail()
  if (!canTransition(order.status, 'CANCELLED')) {
    throw new InvalidTransitionError(order.status, 'CANCELLED')
  }
  const priorStatus = order.status
  order.status = 'CANCELLED'
  order.sagaStatus = 'COMPENSATING'
  await order.save()

  await SagaLog.create({
    sagaId: order.id,
    sagaType: 'order_creation',
    step: 'cancel',
    status: 'COMPENSATING',
    payload: { priorStatus } as Record<string, unknown>,
  })

  const payload: OrderCancelledPayload = {
    orderId: order.id,
    customerId: order.customerId,
    reason,
    lines: order.lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })),
  }
  await publishEvent(
    createEvent(
      'order.cancelled',
      payload as unknown as Record<string, unknown>,
      SERVICE_NAME,
      order.id
    )
  )
  return order
}

export async function validateOrder(orderId: string, sagaId?: string): Promise<Order> {
  const order = await Order.findOrFail(orderId)
  if (order.status !== 'PENDING') return order // already transitioned (idempotent)
  order.status = 'VALIDATED'
  order.sagaStatus = 'COMPLETED'
  await order.save()

  await SagaLog.create({
    sagaId: sagaId ?? order.id,
    sagaType: 'order_creation',
    step: 'validated',
    status: 'COMPLETED',
    payload: null,
  })

  const payload: OrderValidatedPayload = {
    orderId: order.id,
    customerId: order.customerId,
    totalAmount: Number(order.totalAmount),
  }
  await publishEvent(
    createEvent(
      'order.validated',
      payload as unknown as Record<string, unknown>,
      SERVICE_NAME,
      sagaId ?? order.id
    )
  )
  return order
}

export async function cancelOrderFromSaga(
  orderId: string,
  reason: string,
  sagaId?: string
): Promise<Order> {
  const order = await Order.query().where('id', orderId).preload('lines').firstOrFail()
  if (order.status !== 'PENDING') return order
  order.status = 'CANCELLED'
  order.sagaStatus = 'FAILED'
  await order.save()

  await SagaLog.create({
    sagaId: sagaId ?? order.id,
    sagaType: 'order_creation',
    step: 'reservation_failed',
    status: 'FAILED',
    payload: { reason } as Record<string, unknown>,
  })

  const payload: OrderCancelledPayload = {
    orderId: order.id,
    customerId: order.customerId,
    reason,
  }
  await publishEvent(
    createEvent(
      'order.cancelled',
      payload as unknown as Record<string, unknown>,
      SERVICE_NAME,
      sagaId ?? order.id
    )
  )
  return order
}

export async function isEventProcessed(eventId: string): Promise<boolean> {
  const existing = await ProcessedEvent.query().where('event_id', eventId).first()
  return !!existing
}

export async function markEventProcessed(eventId: string, eventType: string): Promise<void> {
  try {
    await ProcessedEvent.create({
      eventId,
      eventType,
      processedAt: DateTime.now(),
    })
  } catch {
    // duplicate — ignore
  }
}
