import { test } from '@japa/runner'
import { parseDateRange, applyDateRange, rangeLabel } from '#services/date_range'

test.group('date_range — parseDateRange', () => {
  test('returns empty range when no input', ({ assert }) => {
    const r = parseDateRange({})
    assert.isUndefined(r.from)
    assert.isUndefined(r.to)
  })

  test('parses ISO date for from/to', ({ assert }) => {
    const r = parseDateRange({ from: '2026-04-01', to: '2026-04-20' })
    assert.isTrue(r.from?.isValid)
    assert.isTrue(r.to?.isValid)
    assert.equal(r.from?.toISODate(), '2026-04-01')
    assert.equal(r.to?.toISODate(), '2026-04-20')
  })

  test('silently drops invalid inputs', ({ assert }) => {
    const r = parseDateRange({ from: 'not-a-date', to: '' })
    assert.isUndefined(r.from)
    assert.isUndefined(r.to)
  })

  test('snaps from to start of day and to to end of day', ({ assert }) => {
    const r = parseDateRange({ from: '2026-04-01', to: '2026-04-01' })
    assert.equal(r.from?.hour, 0)
    assert.equal(r.to?.hour, 23)
  })
})

test.group('date_range — applyDateRange', () => {
  test('calls where() when from/to provided', ({ assert }) => {
    const calls: Array<[string, string, string]> = []
    const fakeBuilder = {
      where: (col: string, op: string, val: string) => {
        calls.push([col, op, val])
        return fakeBuilder
      },
    }
    const r = parseDateRange({ from: '2026-04-01', to: '2026-04-20' })
    applyDateRange(fakeBuilder as any, r, 'created_at')
    assert.equal(calls.length, 2)
    assert.equal(calls[0][0], 'created_at')
    assert.equal(calls[0][1], '>=')
    assert.equal(calls[1][1], '<=')
  })

  test('no-op when range empty', ({ assert }) => {
    const calls: any[] = []
    const fakeBuilder = {
      where: (...args: any[]) => {
        calls.push(args)
        return fakeBuilder
      },
    }
    applyDateRange(fakeBuilder as any, {}, 'created_at')
    assert.equal(calls.length, 0)
  })
})

test.group('date_range — rangeLabel', () => {
  test('all-time when empty', ({ assert }) => {
    assert.equal(rangeLabel({}), 'all-time')
  })

  test('bounded label', ({ assert }) => {
    const r = parseDateRange({ from: '2026-04-01', to: '2026-04-20' })
    assert.equal(rangeLabel(r), '2026-04-01_2026-04-20')
  })

  test('open-ended labels', ({ assert }) => {
    const r1 = parseDateRange({ from: '2026-04-01' })
    assert.equal(rangeLabel(r1), 'from-2026-04-01')
    const r2 = parseDateRange({ to: '2026-04-20' })
    assert.equal(rangeLabel(r2), 'until-2026-04-20')
  })
})
