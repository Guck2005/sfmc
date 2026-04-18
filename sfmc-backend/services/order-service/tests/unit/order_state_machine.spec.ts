import { test } from '@japa/runner'
import { canTransition, InvalidTransitionError, TRANSITIONS } from '#services/order_state_machine'

test.group('Order State Machine', () => {
  test('les transitions autorisées suivent la matrice métier', ({ assert }) => {
    assert.deepEqual(TRANSITIONS.PENDING, ['VALIDATED', 'CANCELLED'])
    assert.deepEqual(TRANSITIONS.VALIDATED, ['IN_PRODUCTION', 'READY', 'CANCELLED'])
    assert.deepEqual(TRANSITIONS.IN_PRODUCTION, ['READY', 'CANCELLED'])
    assert.deepEqual(TRANSITIONS.READY, ['SHIPPED', 'CANCELLED'])
    assert.deepEqual(TRANSITIONS.SHIPPED, ['DELIVERED'])
  })

  test('Transitions valides : PENDING -> VALIDATED, PENDING -> CANCELLED', ({ assert }) => {
    assert.isTrue(canTransition('PENDING', 'VALIDATED'))
    assert.isTrue(canTransition('PENDING', 'CANCELLED'))
  })

  test('Transitions valides : VALIDATED -> READY, READY -> SHIPPED, SHIPPED -> DELIVERED', ({ assert }) => {
    assert.isTrue(canTransition('VALIDATED', 'READY'))
    assert.isTrue(canTransition('READY', 'SHIPPED'))
    assert.isTrue(canTransition('SHIPPED', 'DELIVERED'))
  })

  test('Transitions invalides : PENDING -> SHIPPED retourne false (doit throw dans le service)', ({ assert }) => {
    assert.isFalse(canTransition('PENDING', 'SHIPPED'))
  })

  test('Transitions invalides : DELIVERED -> CANCELLED', ({ assert }) => {
    assert.isFalse(canTransition('DELIVERED', 'CANCELLED'))
  })

  test('Transitions invalides : CANCELLED -> VALIDATED', ({ assert }) => {
    assert.isFalse(canTransition('CANCELLED', 'VALIDATED'))
  })

  test('Transition VALIDATED -> IN_PRODUCTION valide uniquement si requiresProduction = true', ({ assert }) => {
    assert.isTrue(canTransition('VALIDATED', 'IN_PRODUCTION', true))
    assert.isFalse(canTransition('VALIDATED', 'IN_PRODUCTION', false))
    assert.isFalse(canTransition('VALIDATED', 'IN_PRODUCTION')) // false by default
  })

  test('l’erreur de transition invalide expose un code stable', ({ assert }) => {
    const error = new InvalidTransitionError('READY', 'VALIDATED')
    assert.equal(error.code, 'INVALID_TRANSITION')
  })
})
