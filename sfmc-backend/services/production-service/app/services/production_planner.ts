import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import Machine, { type MachineCategory } from '#models/machine'
import ProductionOrder from '#models/production_order'
import { fetchProductCategory } from '#services/product_client'

/**
 * Option A — FIFO by machine name prefix.
 * Each production line is named following the convention `LIGNE-<CATEGORY>-NN`.
 * The planner looks up the first AVAILABLE machine whose name starts with the
 * target prefix (ordered by createdAt asc) and reserves it.
 */
export const CATEGORY_PREFIX: Record<MachineCategory, string> = {
  CIMENT: 'LIGNE-CIMENT-',
  FER: 'LIGNE-FER-',
  BRIQUES: 'LIGNE-BRIQUES-',
  GRANULATS: 'LIGNE-GRANULATS-',
}

export function prefixFor(category: MachineCategory): string {
  return CATEGORY_PREFIX[category]
}

/**
 * Return the first AVAILABLE machine for the given category, or null if none.
 * Selection criteria:
 *   1. `status = 'AVAILABLE'`
 *   2. Matches category (either via `category` column or by name prefix — kept
 *      compatible with legacy seeds that had only a name).
 *   3. FIFO: oldest `createdAt` first.
 */
export async function pickAvailableMachineFor(
  category: MachineCategory,
  trx?: any
): Promise<Machine | null> {
  const query = Machine.query({ client: trx })
    .where('status', 'AVAILABLE')
    .where((q) => {
      q.where('category', category).orWhere('name', 'like', `${prefixFor(category)}%`)
    })
    .orderBy('created_at', 'asc')
    .limit(1)
  const rows = await query
  return rows[0] ?? null
}

export interface PlanInput {
  /** Null si l’OF est créé hors commande (ex. stock libre). */
  orderId: string | null
  productId: string
  quantity: number
  /** If already known (e.g. from the event payload) we skip the HTTP lookup. */
  category?: MachineCategory | null
}

export interface PlanResult {
  productionOrder: ProductionOrder
  machine: Machine | null
  status: 'IN_PROGRESS' | 'PLANNED'
  reason?: 'no_category' | 'no_machine_available' | 'reserved'
}

/**
 * Atomically create a production order and reserve a machine when possible.
 *
 * Behaviour:
 *  - If a matching `AVAILABLE` machine is found → PO is created with
 *    `status=IN_PROGRESS`, `machine_id` set, and the machine is flipped to
 *    `IN_USE` in the same transaction.
 *  - Otherwise → PO is created in `PLANNED` with no machine (file d'attente).
 *
 * Never throws on a "no machine" scenario — it's a legit state.
 */
export async function planProductionOrder(input: PlanInput): Promise<PlanResult> {
  let category = input.category ?? null
  if (!category) {
    category = await fetchProductCategory(input.productId)
  }

  return await db.transaction(async (trx) => {
    const machine = category ? await pickAvailableMachineFor(category, trx) : null

    if (machine) {
      const po = await ProductionOrder.create(
        {
          orderId: input.orderId,
          productId: input.productId,
          quantity: input.quantity,
          status: 'IN_PROGRESS',
          machineId: machine.id,
        },
        { client: trx }
      )

      machine.status = 'IN_USE'
      machine.useTransaction(trx)
      await machine.save()

      logger.info(
        { poId: po.id, machineId: machine.id, category },
        '[planner] production order scheduled on machine'
      )
      return { productionOrder: po, machine, status: 'IN_PROGRESS' as const, reason: 'reserved' }
    }

    const po = await ProductionOrder.create(
      {
        orderId: input.orderId,
        productId: input.productId,
        quantity: input.quantity,
        status: 'PLANNED',
        machineId: null,
      },
      { client: trx }
    )
    const reason: 'no_category' | 'no_machine_available' = category
      ? 'no_machine_available'
      : 'no_category'
    logger.warn(
      { poId: po.id, productId: input.productId, category, reason },
      '[planner] production order queued (no machine assigned)'
    )
    return { productionOrder: po, machine: null, status: 'PLANNED' as const, reason }
  })
}

/**
 * Release the machine attached to a production order, flipping it back to
 * AVAILABLE. The PO keeps its `machine_id` for audit (we only reset the
 * machine state). Safe to call multiple times — a second call is a no-op.
 */
export async function releaseMachineForProductionOrder(
  productionOrderId: string,
  trx?: any
): Promise<Machine | null> {
  const po = await ProductionOrder.find(productionOrderId, { client: trx })
  if (!po?.machineId) return null

  const machine = await Machine.find(po.machineId, { client: trx })
  if (!machine) return null

  if (machine.status === 'IN_USE') {
    machine.status = 'AVAILABLE'
    if (trx) machine.useTransaction(trx)
    await machine.save()
    logger.info(
      { poId: po.id, machineId: machine.id },
      '[planner] machine released back to AVAILABLE'
    )
  }
  return machine
}

/**
 * Scan the PLANNED queue and try to assign each waiting PO to a freshly
 * released machine. Called after a release, best-effort — a failure on one
 * PO does not block the others.
 */
export async function promoteQueuedProductionOrders(): Promise<number> {
  const queued = await ProductionOrder.query()
    .where('status', 'PLANNED')
    .whereNull('machine_id')
    .orderBy('created_at', 'asc')

  let promoted = 0
  for (const po of queued) {
    const category = await fetchProductCategory(po.productId)
    if (!category) continue
    const machine = await pickAvailableMachineFor(category)
    if (!machine) continue

    await db.transaction(async (trx) => {
      po.status = 'IN_PROGRESS'
      po.machineId = machine.id
      po.useTransaction(trx)
      await po.save()

      machine.status = 'IN_USE'
      machine.useTransaction(trx)
      await machine.save()
    })
    promoted++
    logger.info(
      { poId: po.id, machineId: machine.id, category },
      '[planner] queued production order promoted'
    )
  }
  return promoted
}
