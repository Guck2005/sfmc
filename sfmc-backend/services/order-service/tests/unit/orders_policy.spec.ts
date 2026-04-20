import { test } from '@japa/runner'
import {
  canAccessOrder,
  effectiveCustomerFilter,
  effectiveOrderCustomerId,
  isClientRole,
} from '#policies/order_policy'

const CLIENT_A = { id: 'user-a-uuid', role: 'CLIENT' as const }
const CLIENT_B = { id: 'user-b-uuid', role: 'CLIENT' as const }
const OPERATOR = { id: 'op-uuid', role: 'OPERATOR' as const }
const ADMIN = { id: 'admin-uuid', role: 'ADMIN' as const }

test.group('Order policy — isClientRole', () => {
  test('CLIENT → true', ({ assert }) => {
    assert.isTrue(isClientRole('CLIENT'))
  })
  test('OPERATOR/ADMIN/unknown → false', ({ assert }) => {
    assert.isFalse(isClientRole('OPERATOR'))
    assert.isFalse(isClientRole('ADMIN'))
    assert.isFalse(isClientRole(null))
    assert.isFalse(isClientRole(undefined))
  })
})

test.group('Order policy — effectiveCustomerFilter', () => {
  test('CLIENT voit sa liste forcée à son id, ignore le paramètre fourni', ({ assert }) => {
    assert.equal(effectiveCustomerFilter(CLIENT_A, 'autre-uuid'), CLIENT_A.id)
    assert.equal(effectiveCustomerFilter(CLIENT_A, undefined), CLIENT_A.id)
  })

  test('OPERATOR conserve le filtre demandé ou undefined', ({ assert }) => {
    assert.equal(effectiveCustomerFilter(OPERATOR, 'autre-uuid'), 'autre-uuid')
    assert.isUndefined(effectiveCustomerFilter(OPERATOR, undefined))
  })

  test('ADMIN conserve le filtre demandé', ({ assert }) => {
    assert.equal(effectiveCustomerFilter(ADMIN, 'user-x'), 'user-x')
  })

  test('absence de principal — pas de forçage, conserve l\'input', ({ assert }) => {
    assert.equal(effectiveCustomerFilter(null, 'libre'), 'libre')
  })
})

test.group('Order policy — effectiveOrderCustomerId', () => {
  test('CLIENT ne peut créer qu\'une commande pour lui-même', ({ assert }) => {
    assert.equal(effectiveOrderCustomerId(CLIENT_A, 'usurpation'), CLIENT_A.id)
  })

  test('OPERATOR utilise le customerId fourni', ({ assert }) => {
    assert.equal(effectiveOrderCustomerId(OPERATOR, 'client-cible'), 'client-cible')
  })

  test('OPERATOR sans customerId → erreur', ({ assert }) => {
    assert.throws(() => effectiveOrderCustomerId(OPERATOR, undefined))
  })
})

test.group('Order policy — canAccessOrder (isolation CLIENT A / CLIENT B)', () => {
  test('CLIENT A peut lire sa propre commande', ({ assert }) => {
    assert.isTrue(canAccessOrder(CLIENT_A, { customerId: CLIENT_A.id }))
  })

  test('CLIENT A NE PEUT PAS lire la commande de CLIENT B', ({ assert }) => {
    assert.isFalse(canAccessOrder(CLIENT_A, { customerId: CLIENT_B.id }))
  })

  test('OPERATOR peut lire n\'importe quelle commande', ({ assert }) => {
    assert.isTrue(canAccessOrder(OPERATOR, { customerId: CLIENT_A.id }))
    assert.isTrue(canAccessOrder(OPERATOR, { customerId: CLIENT_B.id }))
  })

  test('ADMIN peut lire n\'importe quelle commande', ({ assert }) => {
    assert.isTrue(canAccessOrder(ADMIN, { customerId: CLIENT_A.id }))
  })

  test('absence de principal → refus global', ({ assert }) => {
    assert.isFalse(canAccessOrder(null, { customerId: CLIENT_A.id }))
  })
})
