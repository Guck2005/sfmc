import { test } from '@japa/runner'
import { DateTime } from 'luxon'

/**
 * Unit-level assertions on the OAuth2 Authorization Code model and its
 * expiry rule. The full HTTP flow is covered by the smoke test (authorize →
 * token → validate) so we keep this close to the business invariants.
 */
test.group('OauthAuthorizationCode — isExpired', () => {
  test('not expired when expiresAt is in the future', async ({ assert }) => {
    const { default: OauthAuthorizationCode } = await import('#models/oauth_authorization_code')
    const record = new OauthAuthorizationCode()
    record.expiresAt = DateTime.now().plus({ minutes: 5 })
    assert.isFalse(record.isExpired)
  })

  test('expired when expiresAt is in the past', async ({ assert }) => {
    const { default: OauthAuthorizationCode } = await import('#models/oauth_authorization_code')
    const record = new OauthAuthorizationCode()
    record.expiresAt = DateTime.now().minus({ minutes: 1 })
    assert.isTrue(record.isExpired)
  })
})
