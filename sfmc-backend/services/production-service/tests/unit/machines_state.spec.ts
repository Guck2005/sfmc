import { test } from '@japa/runner'
import { isValidMachineTransition } from '#validators/machine_validator'

test.group('Machine state transitions', () => {
  test('AVAILABLE → IN_USE is allowed', ({ assert }) => {
    assert.isTrue(isValidMachineTransition('AVAILABLE', 'IN_USE'))
  })

  test('AVAILABLE → MAINTENANCE is allowed', ({ assert }) => {
    assert.isTrue(isValidMachineTransition('AVAILABLE', 'MAINTENANCE'))
  })

  test('IN_USE → AVAILABLE is allowed (release)', ({ assert }) => {
    assert.isTrue(isValidMachineTransition('IN_USE', 'AVAILABLE'))
  })

  test('IN_USE → MAINTENANCE is allowed (breakdown)', ({ assert }) => {
    assert.isTrue(isValidMachineTransition('IN_USE', 'MAINTENANCE'))
  })

  test('MAINTENANCE → AVAILABLE is allowed (end maintenance)', ({ assert }) => {
    assert.isTrue(isValidMachineTransition('MAINTENANCE', 'AVAILABLE'))
  })

  test('MAINTENANCE → IN_USE is forbidden (must pass via AVAILABLE)', ({ assert }) => {
    assert.isFalse(isValidMachineTransition('MAINTENANCE', 'IN_USE'))
  })

  test('same-state transitions are treated as no-op and allowed', ({ assert }) => {
    assert.isTrue(isValidMachineTransition('AVAILABLE', 'AVAILABLE'))
    assert.isTrue(isValidMachineTransition('IN_USE', 'IN_USE'))
    assert.isTrue(isValidMachineTransition('MAINTENANCE', 'MAINTENANCE'))
  })
})
