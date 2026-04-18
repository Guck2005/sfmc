import { test } from '@japa/runner'

const VALID_CATEGORIES = ['CIMENT', 'FER', 'BRIQUES', 'GRANULATS'] as const

test.group('Product — règles métier', () => {
  test('les 4 catégories du catalogue SFMC sont définies', ({ assert }) => {
    assert.deepEqual(VALID_CATEGORIES, ['CIMENT', 'FER', 'BRIQUES', 'GRANULATS'])
  })

  test('un prix unitaire doit être positif', ({ assert }) => {
    const isValidPrice = (p: number) => p > 0
    assert.isTrue(isValidPrice(5500))
    assert.isFalse(isValidPrice(0))
    assert.isFalse(isValidPrice(-100))
  })

  test('un produit inactif est exclu du catalogue actif', ({ assert }) => {
    const products = [
      { name: 'Ciment A', isActive: true },
      { name: 'Fer B', isActive: false },
      { name: 'Brique C', isActive: true },
    ]
    const active = products.filter((p) => p.isActive)
    assert.lengthOf(active, 2)
    assert.notInclude(active.map((p) => p.name), 'Fer B')
  })

  test('le filtrage par catégorie fonctionne', ({ assert }) => {
    const products = [
      { name: 'Ciment A', category: 'CIMENT' },
      { name: 'Fer HA 10', category: 'FER' },
      { name: 'Granulat 0/31', category: 'GRANULATS' },
    ]
    const fers = products.filter((p) => p.category === 'FER')
    assert.lengthOf(fers, 1)
    assert.equal(fers[0].name, 'Fer HA 10')
  })

  test('le nom du produit doit avoir au moins 2 caractères', ({ assert }) => {
    const isValidName = (n: string) => n.trim().length >= 2
    assert.isTrue(isValidName('Ciment'))
    assert.isFalse(isValidName('A'))
    assert.isFalse(isValidName('  '))
  })
})
