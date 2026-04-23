import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Order, { type OrderStatus } from '#models/order'
import OrderLine from '#models/order_line'
import SagaLog from '#models/saga_log'
import ProcessedEvent from '#models/processed_event'
import { canTransition, InvalidTransitionError } from '#services/order_state_machine'
import { publishEvent } from '#services/rabbitmq'
import {
  currentYearFromDb,
  formatOrderPublicNumber,
  nextOrderSequence,
} from '#services/reference_sequence'
import { checkAvailability } from '#services/inventory_client'
import { fetchProductSnapshot } from '#services/product_client'
import { fetchCustomerEmail } from '#services/customer_contact'
import type { DomainEvent } from '@sfmc/shared-types'
import {
  type OrderCreatedPayload,
  type OrderCancelledPayload,
  type OrderValidatedPayload,
  type OrderShippedPayload,
  type OrderDeliveredPayload,
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

export class ProductNotFoundError extends Error {
  public readonly code = 'PRODUCT_NOT_FOUND'
  constructor(public productId: string) {
    super(`Produit inconnu dans le catalogue : ${productId}`)
  }
}

export class ProductCatalogUnavailableError extends Error {
  public readonly code = 'PRODUCT_CATALOG_UNAVAILABLE'
  constructor() {
    super('Le service catalogue est momentanément indisponible')
  }
}

export interface CreateOrderLineInput {
  productId: string
  quantity: number
  unitPrice: number
}

export interface CreateOrderInput {
  customerId: string
  lines: CreateOrderLineInput[]
}

type OrderLineWithSnapshot = CreateOrderLineInput & { productName: string }

async function resolveProductSnapshots(lines: CreateOrderLineInput[]): Promise<OrderLineWithSnapshot[]> {
  const uniqueIds = [...new Set(lines.map((l) => l.productId))]
  const nameById = new Map<string, string>()
  await Promise.all(
    uniqueIds.map(async (productId) => {
      const r = await fetchProductSnapshot(productId)
      if (r.status === 'not_found') throw new ProductNotFoundError(productId)
      if (r.status === 'unavailable') throw new ProductCatalogUnavailableError()
      nameById.set(productId, r.name)
    })
  )
  return lines.map((line) => ({
    ...line,
    productName: nameById.get(line.productId)!,
  }))
}

async function createPendingOrder(
  input: { customerId: string; lines: OrderLineWithSnapshot[] },
  totalAmount: number
): Promise<Order> {
  return await db.transaction(async (trx) => {
    const year = currentYearFromDb()
    const seq = await nextOrderSequence(trx, year)
    const orderNumber = formatOrderPublicNumber(year, seq)

    const order = await Order.create(
      {
        orderNumber,
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
          productName: line.productName,
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
  const linesWithSnapshot = await resolveProductSnapshots(input.lines)
  const totalAmount = linesWithSnapshot.reduce(
    (sum, l) => sum + Number(l.unitPrice) * Number(l.quantity),
    0
  )
  const order = await createPendingOrder({ customerId: input.customerId, lines: linesWithSnapshot }, totalAmount)

  for (const line of linesWithSnapshot) {
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
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    lines: linesWithSnapshot.map(({ productId, quantity, unitPrice, productName }) => ({
      productId,
      quantity,
      unitPrice,
      productName,
    })),
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
  // TRANSITION explicite vers IN_PRODUCTION : l’opérateur confirme qu’on passe par la prod (requiresProduction=true).
  const requiresProduction = to === 'IN_PRODUCTION'
  if (!canTransition(order.status, to, requiresProduction)) {
    throw new InvalidTransitionError(order.status, to)
  }
  order.status = to
  await order.save()

  if (to === 'SHIPPED') {
    const customerEmail = (await fetchCustomerEmail(order.customerId)) ?? undefined
    const payload: OrderShippedPayload = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerEmail,
      shippedAt: new Date().toISOString(),
    }
    await publishEvent(
      createEvent(
        'order.shipped',
        payload as unknown as Record<string, unknown>,
        SERVICE_NAME,
        order.id
      )
    )
  } else if (to === 'DELIVERED') {
    const customerEmail = (await fetchCustomerEmail(order.customerId)) ?? undefined
    const payload: OrderDeliveredPayload = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerEmail,
      deliveredAt: new Date().toISOString(),
    }
    await publishEvent(
      createEvent(
        'order.delivered',
        payload as unknown as Record<string, unknown>,
        SERVICE_NAME,
        order.id
      )
    )
  }

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

  const customerEmail = (await fetchCustomerEmail(order.customerId)) ?? undefined
  const payload: OrderCancelledPayload = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    customerEmail,
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

  const customerEmail = (await fetchCustomerEmail(order.customerId)) ?? undefined
  const payload: OrderValidatedPayload = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    customerEmail,
    totalAmount: Number(order.totalAmount),
    currency: 'XOF',
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

  const customerEmail = (await fetchCustomerEmail(order.customerId)) ?? undefined
  const payload: OrderCancelledPayload = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    customerEmail,
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
