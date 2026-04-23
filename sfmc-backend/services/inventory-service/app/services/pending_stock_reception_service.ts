import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import Stock from '#models/stock'
import PendingStockEntry from '#models/pending_stock_entry'
import { recordMovement } from '#services/stock_service'
import type { ProductionCompletedPayload } from '@sfmc/event-contracts'

export class PendingStockEntryNotFoundError extends Error {
  public readonly code = 'PENDING_STOCK_NOT_FOUND'
  constructor() {
    super('Réception en attente introuvable')
    this.name = 'PendingStockEntryNotFoundError'
  }
}

export class PendingStockEntryInvalidStateError extends Error {
  public readonly code = 'PENDING_STOCK_INVALID_STATE'
  constructor(message: string) {
    super(message)
    this.name = 'PendingStockEntryInvalidStateError'
  }
}

/**
 * Garantit une ligne stock pour (produit, entrepôt) — une seule ligne par couple (contrainte unique).
 */
export async function ensureStockLine(
  trx: TransactionClientContract,
  productId: string,
  warehouseId: string
): Promise<Stock> {
  const existing = await Stock.query({ client: trx })
    .where('product_id', productId)
    .where('warehouse_id', warehouseId)
    .forUpdate()
    .first()

  if (existing) return existing

  return await Stock.create(
    {
      productId,
      warehouseId,
      quantity: 0,
      reserved: 0,
      threshold: 0,
    },
    { client: trx }
  )
}

export async function createPendingFromProductionCompleted(
  payload: ProductionCompletedPayload,
  sourceEventId: string
): Promise<PendingStockEntry> {
  return await PendingStockEntry.create({
    productionOrderId: payload.productionOrderId,
    productId: payload.productId,
    quantity: Number(payload.quantity),
    status: 'PENDING',
    sourceEventId,
  })
}

export async function confirmPendingStockReception(params: {
  pendingId: string
  warehouseId: string
  /** Si absent, toute la quantité en attente est réceptionnée. */
  quantity?: number
  userId: string
}): Promise<{ pending: PendingStockEntry; stock: Stock }> {
  return await db.transaction(async (trx) => {
    const pending = await PendingStockEntry.query({ client: trx }).where('id', params.pendingId).forUpdate().first()

    if (!pending) {
      throw new PendingStockEntryNotFoundError()
    }
    if (pending.status !== 'PENDING') {
      throw new PendingStockEntryInvalidStateError('Cette réception a déjà été traitée ou annulée.')
    }

    const qty = params.quantity != null ? Number(params.quantity) : Number(pending.quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new PendingStockEntryInvalidStateError('Quantité invalide.')
    }
    if (qty > Number(pending.quantity)) {
      throw new PendingStockEntryInvalidStateError('La quantité dépasse celle en attente.')
    }

    const stock = await ensureStockLine(trx, pending.productId, params.warehouseId)

    await recordMovement(
      {
        stockId: stock.id,
        type: 'IN',
        quantity: qty,
        origin: 'pending_reception.confirmed',
        referenceId: pending.productionOrderId,
        createdBy: params.userId,
      },
      trx
    )

    const initialQty = Number(pending.quantity)
    const remaining = initialQty - qty

    if (remaining > 0) {
      pending.quantity = remaining
      await pending.useTransaction(trx).save()
    } else {
      pending.status = 'CONFIRMED'
      pending.quantity = initialQty
      pending.warehouseId = params.warehouseId
      pending.confirmedQuantity = qty
      pending.confirmedByUserId = params.userId
      pending.confirmedAt = DateTime.now()
      await pending.useTransaction(trx).save()
    }

    await stock.refresh()
    return { pending, stock }
  })
}
