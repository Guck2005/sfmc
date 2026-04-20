import { test } from '@japa/runner'

/**
 * Unit-level guardrails on the `user.role_changed` listener.
 *
 * The full "role applied + refresh tokens revoked" flow requires a live
 * PostgreSQL instance and is therefore exercised end-to-end by the smoke test
 * (LOT 7). Here we only assert that the listener's payload contract is
 * enforced — no DB calls should happen when the payload is malformed.
 */
test.group('user_listeners — onUserRoleChanged payload gate', () => {
  test('returns early when payload has no userId', async ({ assert }) => {
    const { onUserRoleChanged } = await import('#listeners/user_listeners')
    // Would throw if it tried to touch the DB, since we don't wire any model:
    await assert.doesNotReject(() =>
      onUserRoleChanged({
        id: 'evt-1',
        type: 'user.role_changed',
        version: '1',
        timestamp: new Date().toISOString(),
        payload: { newRole: 'ADMIN' } as any,
        metadata: { sourceService: 'test', correlationId: 'corr-1' },
      })
    )
  })

  test('returns early when payload has no newRole', async ({ assert }) => {
    const { onUserRoleChanged } = await import('#listeners/user_listeners')
    await assert.doesNotReject(() =>
      onUserRoleChanged({
        id: 'evt-2',
        type: 'user.role_changed',
        version: '1',
        timestamp: new Date().toISOString(),
        payload: { userId: 'uuid-user' } as any,
        metadata: { sourceService: 'test', correlationId: 'corr-2' },
      })
    )
  })

  test('applyRoleChange returns zero updates for unknown userId', async ({ assert }) => {
    const { applyRoleChange } = await import('#listeners/user_listeners')
    const result = await applyRoleChange(
      '00000000-0000-0000-0000-000000000000',
      'OPERATOR'
    )
    assert.isFalse(result.userUpdated)
    assert.equal(result.tokensRevoked, 0)
  })
})
