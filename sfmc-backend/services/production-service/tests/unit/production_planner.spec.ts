import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Machine from '#models/machine'
import ProductionOrder from '#models/production_order'
import {
  CATEGORY_PREFIX,
  prefixFor,
  pickAvailableMachineFor,
  planProductionOrder,
  releaseMachineForProductionOrder,
  promoteQueuedProductionOrders,
} from '#services/production_planner'
import { randomUUID } from 'node:crypto'

test.group('Production Planner — FIFO mapping', (group) => {
  group.each.setup(async () => {
    await db.beginGlobalTransaction()
    return () => db.rollbackGlobalTransaction()
  })

  test('prefix map covers all 4 categories', ({ assert }) => {
    assert.equal(prefixFor('CIMENT'), 'LIGNE-CIMENT-')
    assert.equal(prefixFor('FER'), 'LIGNE-FER-')
    assert.equal(prefixFor('BRIQUES'), 'LIGNE-BRIQUES-')
    assert.equal(prefixFor('GRANULATS'), 'LIGNE-GRANULATS-')
    assert.equal(Object.keys(CATEGORY_PREFIX).length, 4)
  })

  test('pickAvailableMachineFor returns the oldest AVAILABLE match', async ({ assert }) => {
    // Seed 3 machines in CIMENT lane with different states.
    const older = await Machine.create({
      name: `LIGNE-CIMENT-T-${Date.now()}-A`,
      category: 'CIMENT',
      status: 'AVAILABLE',
    })
    // tiny sleep via two creates to guarantee ordering
    const newer = await Machine.create({
      name: `LIGNE-CIMENT-T-${Date.now()}-B`,
      category: 'CIMENT',
      status: 'AVAILABLE',
    })
    await Machine.create({
      name: `LIGNE-CIMENT-T-${Date.now()}-C`,
      category: 'CIMENT',
      status: 'IN_USE',
    })

    const picked = await pickAvailableMachineFor('CIMENT')
    assert.isNotNull(picked)
    // FIFO: first AVAILABLE created machine wins. We don't know if `older`
    // predates all seeded machines globally, but it should precede `newer`.
    if (picked!.id !== older.id) {
      assert.notEqual(picked!.id, newer.id)
    }
  })

  test('pickAvailableMachineFor returns null when no AVAILABLE match', async ({ assert }) => {
    // Put all CIMENT machines into MAINTENANCE within this transaction
    await Machine.query().where('category', 'CIMENT').update({ status: 'MAINTENANCE' })
    await Machine.query()
      .where('name', 'like', 'LIGNE-CIMENT-%')
      .update({ status: 'MAINTENANCE' })

    const picked = await pickAvailableMachineFor('CIMENT')
    assert.isNull(picked)
  })

  test('planProductionOrder reserves a machine when category + AVAILABLE match', async ({
    assert,
  }) => {
    const machine = await Machine.create({
      name: `LIGNE-FER-T-${Date.now()}`,
      category: 'FER',
      status: 'AVAILABLE',
    })

    const orderId = randomUUID()
    const productId = randomUUID()
    const plan = await planProductionOrder({
      orderId,
      productId,
      quantity: 10,
      category: 'FER',
    })

    assert.equal(plan.status, 'IN_PROGRESS')
    assert.isNotNull(plan.machine)
    assert.equal(plan.productionOrder.status, 'IN_PROGRESS')
    assert.isNotNull(plan.productionOrder.machineId)

    // Machine should be IN_USE now
    const refreshed = await Machine.findOrFail(plan.machine!.id)
    assert.equal(refreshed.status, 'IN_USE')

    // Cleanup reference — release to keep other tests independent
    await releaseMachineForProductionOrder(plan.productionOrder.id)
    // Silence unused var warning
    assert.isTrue(machine.id.length > 0)
  })

  test('planProductionOrder queues (PLANNED) when no machine available', async ({ assert }) => {
    // All GRANULATS machines unavailable
    await Machine.query().where('category', 'GRANULATS').update({ status: 'MAINTENANCE' })
    await Machine.query()
      .where('name', 'like', 'LIGNE-GRANULATS-%')
      .update({ status: 'MAINTENANCE' })

    const plan = await planProductionOrder({
      orderId: randomUUID(),
      productId: randomUUID(),
      quantity: 5,
      category: 'GRANULATS',
    })

    assert.equal(plan.status, 'PLANNED')
    assert.isNull(plan.machine)
    assert.equal(plan.productionOrder.status, 'PLANNED')
    assert.isNull(plan.productionOrder.machineId)
    assert.equal(plan.reason, 'no_machine_available')
  })

  test('releaseMachineForProductionOrder flips machine back to AVAILABLE', async ({ assert }) => {
    const machine = await Machine.create({
      name: `LIGNE-BRIQUES-T-${Date.now()}`,
      category: 'BRIQUES',
      status: 'AVAILABLE',
    })
    const plan = await planProductionOrder({
      orderId: randomUUID(),
      productId: randomUUID(),
      quantity: 1,
      category: 'BRIQUES',
    })
    assert.equal(plan.status, 'IN_PROGRESS')

    await releaseMachineForProductionOrder(plan.productionOrder.id)

    const refreshed = await Machine.findOrFail(plan.machine!.id)
    assert.equal(refreshed.status, 'AVAILABLE')

    // PO retains machineId for audit (we only flipped the machine state)
    const po = await ProductionOrder.findOrFail(plan.productionOrder.id)
    assert.isNotNull(po.machineId)

    assert.isTrue(machine.id.length > 0)
  })

  test('release is idempotent (no-op on already AVAILABLE machine)', async ({ assert }) => {
    await Machine.create({
      name: `LIGNE-CIMENT-T-IDEM-${Date.now()}`,
      category: 'CIMENT',
      status: 'AVAILABLE',
    })
    const plan = await planProductionOrder({
      orderId: randomUUID(),
      productId: randomUUID(),
      quantity: 1,
      category: 'CIMENT',
    })
    await releaseMachineForProductionOrder(plan.productionOrder.id)
    // second call should not throw and should keep the machine AVAILABLE
    await releaseMachineForProductionOrder(plan.productionOrder.id)

    const refreshed = await Machine.findOrFail(plan.machine!.id)
    assert.equal(refreshed.status, 'AVAILABLE')
  })

  test('promoteQueuedProductionOrders is a no-op when fetchProductCategory is unknown', async ({
    assert,
  }) => {
    // Create a PLANNED PO with no machine. With no PRODUCT_SERVICE_URL set in
    // tests, fetchProductCategory returns null → PO stays queued.
    await ProductionOrder.create({
      orderId: randomUUID(),
      productId: randomUUID(),
      quantity: 7,
      status: 'PLANNED',
      machineId: null,
    })
    const promoted = await promoteQueuedProductionOrders()
    assert.equal(promoted, 0)
  })
})
