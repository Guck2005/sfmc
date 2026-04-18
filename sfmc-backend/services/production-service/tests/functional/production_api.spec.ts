import { test } from '@japa/runner'
import ProductionOrder from '#models/production_order'
import db from '@adonisjs/lucid/services/db'
import crypto from 'node:crypto'

test.group('Production Quality API', (group) => {
  group.each.setup(async () => {
    await db.beginGlobalTransaction()
    return () => db.rollbackGlobalTransaction()
  })

  test('POST /api/v1/production-orders/:id/quality completes a passed quality check', async ({ client, assert }) => {
    // Seed an IN_PROGRESS order
    const po = await ProductionOrder.create({
      orderId: crypto.randomUUID(),
      productId: crypto.randomUUID(),
      quantity: 10,
      status: 'IN_PROGRESS'
    })

    const response = await client.post(`/api/v1/production-orders/${po.id}/quality`).json({
      passed: true,
      comments: 'All good'
    })

    response.assertStatus(200)
    
    await po.refresh()
    assert.equal(po.status, 'COMPLETED')
  })

  test('POST /api/v1/production-orders/:id/quality fails a rejected quality check', async ({ client, assert }) => {
    const po = await ProductionOrder.create({
      orderId: crypto.randomUUID(),
      productId: crypto.randomUUID(),
      quantity: 10,
      status: 'IN_PROGRESS'
    })

    const response = await client.post(`/api/v1/production-orders/${po.id}/quality`).json({
      passed: false,
      comments: 'Defective parts'
    })

    response.assertStatus(200)
    
    await po.refresh()
    assert.equal(po.status, 'REJECTED')
  })
})
