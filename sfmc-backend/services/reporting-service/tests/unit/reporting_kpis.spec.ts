import { test } from '@japa/runner'
import { qualityFailureRate } from '#services/reporting_kpis'

test.group('reporting KPIs — qualityFailureRate', () => {
  test('returns 0 when no production orders', ({ assert }) => {
    assert.equal(qualityFailureRate(0, 0), 0)
  })

  test('returns 0 when no failures', ({ assert }) => {
    assert.equal(qualityFailureRate(10, 0), 0)
  })

  test('returns 25 when 1 of 4 failed', ({ assert }) => {
    assert.equal(qualityFailureRate(4, 1), 25)
  })

  test('returns 100 when every order failed', ({ assert }) => {
    assert.equal(qualityFailureRate(5, 5), 100)
  })

  test('rounds to 2 decimals', ({ assert }) => {
    assert.equal(qualityFailureRate(3, 1), 33.33)
  })

  test('guards against negative totals', ({ assert }) => {
    assert.equal(qualityFailureRate(-1, 1), 0)
  })
})
