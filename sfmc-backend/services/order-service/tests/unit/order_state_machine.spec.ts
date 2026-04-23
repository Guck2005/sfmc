import { test } from '@japa/runner'
import {
  canTransition,
  InvalidTransitionError,
  TRANSITIONS,
  WORKFLOW_STATUSES,
} from '#services/order_state_machine'

test.group('Order State Machine', () => {
  test('TRANSITIONS décrit le chemin nominal saga (documentation)', ({ assert }) => {
    assert.deepEqual(TRANSITIONS.PENDING, ['VALIDATED', 'CANCELLED'])
    assert.deepEqual(TRANSITIONS.VALIDATED, ['IN_PRODUCTION', 'READY', 'CANCELLED'])
    assert.deepEqual(TRANSITIONS.IN_PRODUCTION, ['READY', 'CANCELLED'])
    assert.deepEqual(TRANSITIONS.READY, ['SHIPPED', 'CANCELLED'])
    assert.deepEqual(TRANSITIONS.SHIPPED, ['DELIVERED'])
  })

  test('WORKFLOW_STATUSES liste les 6 états éditables par PUT status', ({ assert }) => {
    assert.equal(WORKFLOW_STATUSES.length, 6)
    assert.isTrue(WORKFLOW_STATUSES.includes('VALIDATED'))
    assert.isFalse(WORKFLOW_STATUSES.includes('CANCELLED' as any))
  })

  test('canTransition : annulation depuis les états autorisés', ({ assert }) => {
    assert.isTrue(canTransition('PENDING', 'CANCELLED'))
    assert.isTrue(canTransition('VALIDATED', 'CANCELLED'))
    assert.isTrue(canTransition('IN_PRODUCTION', 'CANCELLED'))
    assert.isTrue(canTransition('READY', 'CANCELLED'))
    assert.isFalse(canTransition('SHIPPED', 'CANCELLED'))
    assert.isFalse(canTransition('DELIVERED', 'CANCELLED'))
  })

  test('canTransition : depuis CANCELLED tout est refusé', ({ assert }) => {
    assert.isFalse(canTransition('CANCELLED', 'VALIDATED'))
    assert.isFalse(canTransition('CANCELLED', 'PENDING'))
  })

  test('canTransition : retours en arrière autorisés (back-office), sauf depuis LIVRÉE', ({ assert }) => {
    assert.isTrue(canTransition('READY', 'VALIDATED'))
    assert.isTrue(canTransition('SHIPPED', 'IN_PRODUCTION'))
    assert.isTrue(canTransition('PENDING', 'SHIPPED'))
    assert.isFalse(canTransition('DELIVERED', 'PENDING'))
    assert.isFalse(canTransition('DELIVERED', 'VALIDATED'))
  })

  test('canTransition : VALIDATED -> IN_PRODUCTION exige le flag production', ({ assert }) => {
    assert.isTrue(canTransition('VALIDATED', 'IN_PRODUCTION', true))
    assert.isFalse(canTransition('VALIDATED', 'IN_PRODUCTION', false))
    assert.isFalse(canTransition('VALIDATED', 'IN_PRODUCTION'))
  })

  test('canTransition : READY -> IN_PRODUCTION autorisé (flag true côté service)', ({ assert }) => {
    assert.isTrue(canTransition('READY', 'IN_PRODUCTION', true))
  })

  test('l’erreur de transition invalide expose un code stable', ({ assert }) => {
    const error = new InvalidTransitionError('READY', 'VALIDATED')
    assert.equal(error.code, 'INVALID_TRANSITION')
  })
})
