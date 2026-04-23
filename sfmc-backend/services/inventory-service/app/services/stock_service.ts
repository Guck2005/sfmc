import Stock from '#models/stock'
import StockMovement from '#models/stock_movement'
import ProcessedEvent from '#models/processed_event'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { publishEvent } from '#services/rabbitmq'
import type { DomainEvent } from '@sfmc/shared-types'
import { type InventoryCriticalPayload } from '@sfmc/event-contracts'

export const SERVICE_NAME = 'inventory-service'

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

export interface MovementInput {
  stockId: string
  type: 'IN' | 'OUT' | 'ADJUSTMENT'
  quantity: number
  origin: string
  referenceId?: string | null
  createdBy?: string | null
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

export function computeAvailable(stock: { quantity: number; reserved: number }): number {
  return Number(stock.quantity) - Number(stock.reserved)
}

export function isCritical(stock: { quantity: number; reserved: number; threshold: number }): boolean {
  return computeAvailable(stock) < Number(stock.threshold)
}

async function recordMovementWithClient(
  trx: TransactionClientContract,
  input: MovementInput
): Promise<StockMovement> {
  const stock = await Stock.findOrFail(input.stockId, { client: trx })
  const qty = Number(input.quantity)

  if (input.type === 'IN') {
    stock.quantity = Number(stock.quantity) + qty
  } else if (input.type === 'OUT') {
    const available = computeAvailable(stock)
    if (qty > available) {
      throw new InsufficientStockError(stock.productId, qty, available)
    }
    stock.quantity = Number(stock.quantity) - qty
  } else if (input.type === 'ADJUSTMENT') {
    stock.quantity = qty
  }
  await stock.useTransaction(trx).save()

  const movement = await StockMovement.create(
    {
      stockId: stock.id,
      type: input.type,
      quantity: qty,
      origin: input.origin,
      referenceId: input.referenceId ?? null,
      createdBy: input.createdBy ?? null,
      date: DateTime.now(),
    },
    { client: trx }
  )

  if (input.type === 'OUT' && isCritical(stock)) {
    setImmediate(() => {
      const payload: InventoryCriticalPayload = {
        productId: stock.productId,
        warehouseId: stock.warehouseId,
        stockId: stock.id,
        available: computeAvailable(stock),
        threshold: Number(stock.threshold),
      }
      publishEvent(
        createEvent('inventory.critical', payload as unknown as Record<string, unknown>, SERVICE_NAME)
      ).catch(() => {})
    })
  }

  return movement
}

/** @param trx Si fourni, exécute dans cette transaction (pas de transaction imbriquée). */
export async function recordMovement(
  input: MovementInput,
  trx?: TransactionClientContract
): Promise<StockMovement> {
  if (trx) {
    return await recordMovementWithClient(trx, input)
  }
  return await db.transaction(async (inner) => recordMovementWithClient(inner, input))
}

export async function reserveForOrder(params: {
  orderId: string
  lines: Array<{ productId: string; quantity: number }>
}): Promise<{ reservations: Array<{ productId: string; stockId: string; quantity: number }> }> {
  return await db.transaction(async (trx) => {
    const reservations: Array<{ productId: string; stockId: string; quantity: number }> = []
    for (const line of params.lines) {
      const stock = await Stock.query({ client: trx })
        .where('product_id', line.productId)
        .orderBy('quantity', 'desc')
        .first()
      if (!stock) {
        throw new InsufficientStockError(line.productId, line.quantity, 0)
      }
      const available = computeAvailable(stock)
      if (line.quantity > available) {
        throw new InsufficientStockError(line.productId, line.quantity, available)
      }
      stock.reserved = Number(stock.reserved) + Number(line.quantity)
      await stock.useTransaction(trx).save()
      reservations.push({ productId: line.productId, stockId: stock.id, quantity: line.quantity })
    }
    return { reservations }
  })
}

export async function releaseForOrder(params: {
  orderId: string
  lines: Array<{ productId: string; quantity: number }>
}): Promise<void> {
  await db.transaction(async (trx) => {
    for (const line of params.lines) {
      const stock = await Stock.query({ client: trx })
        .where('product_id', line.productId)
        .orderBy('reserved', 'desc')
        .first()
      if (!stock) continue
      const release = Math.min(Number(stock.reserved), Number(line.quantity))
      stock.reserved = Number(stock.reserved) - release
      if (stock.reserved < 0) stock.reserved = 0
      await stock.useTransaction(trx).save()
    }
  })
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
    // unique violation — already processed by parallel consumer
  }
}

export async function incrementProductStock(params: {
  productId: string
  warehouseId?: string
  quantity: number
  referenceId?: string
}): Promise<Stock> {
  return await db.transaction(async (trx) => {
    const query = Stock.query({ client: trx }).where('product_id', params.productId)
    if (params.warehouseId) query.where('warehouse_id', params.warehouseId)
    let stock = await query.first()
    if (!stock) {
      throw new Error(`Aucune ligne de stock pour le produit ${params.productId}`)
    }
    stock.quantity = Number(stock.quantity) + Number(params.quantity)
    await stock.useTransaction(trx).save()

    await StockMovement.create(
      {
        stockId: stock.id,
        type: 'IN',
        quantity: Number(params.quantity),
        origin: 'production.completed',
        referenceId: params.referenceId ?? null,
        date: DateTime.now(),
      },
      { client: trx }
    )
    return stock
  })
}
