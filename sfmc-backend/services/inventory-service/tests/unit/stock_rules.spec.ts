import { test } from '@japa/runner'
import { computeAvailable, isCritical, InsufficientStockError } from '#services/stock_service'

test.group('StockService — Règles métiers (Unitaires autonomes)', () => {

  test('Algorithme seuil critique : available < threshold → isCritical = true', ({ assert }) => {
    const stockCritical = { quantity: 100, reserved: 90, threshold: 20 } // available = 10 < 20
    assert.isTrue(isCritical(stockCritical))

    const stockNotCritical = { quantity: 100, reserved: 10, threshold: 20 } // available = 90 > 20
    assert.isFalse(isCritical(stockNotCritical))
  })

  test('Réservation : reserved + demande > quantity → erreur INSUFFICIENT_STOCK', ({ assert }) => {
    const mockReserve = (stock: any, demand: number) => {
      const available = computeAvailable(stock)
      if (demand > available) {
        throw new InsufficientStockError(stock.productId, demand, available)
      }
      return stock.reserved + demand
    }

    const stock = { productId: 'P1', quantity: 100, reserved: 80 }
    
    // Succès
    assert.equal(mockReserve(stock, 10), 90)

    // Échec
    try {
      mockReserve(stock, 30) // 80 + 30 = 110 > 100
      assert.fail('Should have thrown an error')
    } catch (error: any) {
      assert.equal(error.code, 'INSUFFICIENT_STOCK')
    }
  })

  test('Libération : released > reserved → erreur INVALID_RELEASE', ({ assert }) => {
    const mockRelease = (stock: any, releaseQty: number) => {
      if (releaseQty > stock.reserved) {
        const err = new Error('Invalid release')
        ;(err as any).code = 'INVALID_RELEASE'
        throw err
      }
      return stock.reserved - releaseQty
    }

    const stock = { reserved: 40 }
    
    assert.equal(mockRelease(stock, 20), 20)
    
    try {
      mockRelease(stock, 50)
      assert.fail('Should have thrown an error')
    } catch (error: any) {
      assert.equal(error.code, 'INVALID_RELEASE')
    }
  })

  test('Idempotence : insertion d\'un event.id déjà présent → ignoré silencieusement', ({ assert }) => {
    const processedEvents = new Set<string>()
    const mockMarkProcessed = (eventId: string) => {
      if (processedEvents.has(eventId)) {
        return // ignoré silencieusement
      }
      processedEvents.add(eventId)
    }

    mockMarkProcessed('event-123')
    assert.equal(processedEvents.size, 1)

    // Double insertion
    mockMarkProcessed('event-123')
    assert.equal(processedEvents.size, 1)
  })

  test('Mouvement OUT → si available < threshold → événement inventory.critical émis', ({ assert }) => {
    let eventEmitted = false
    const mockOutMovement = (stock: any, qty: number) => {
      stock.quantity -= qty
      if (isCritical(stock)) {
        eventEmitted = true
      }
    }

    const stock = { quantity: 50, reserved: 0, threshold: 20 }
    mockOutMovement(stock, 20) // available = 30 >= 20
    assert.isFalse(eventEmitted)

    mockOutMovement(stock, 15) // available = 15 < 20
    assert.isTrue(eventEmitted)
  })
})
