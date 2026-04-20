import { test } from '@japa/runner'
import { toCsv } from '#services/reporting_kpis'

test.group('reporting KPIs — toCsv', () => {
  test('renders header line + empty dataset with trailing newline', ({ assert }) => {
    const csv = toCsv(['a', 'b'], [])
    assert.equal(csv, 'a,b\n')
  })

  test('renders simple rows', ({ assert }) => {
    const csv = toCsv(['status', 'count'], [
      ['VALIDATED', 3],
      ['CANCELLED', 1],
    ])
    assert.equal(csv, 'status,count\nVALIDATED,3\nCANCELLED,1\n')
  })

  test('escapes values containing commas', ({ assert }) => {
    const csv = toCsv(['label'], [['a, b, c']])
    assert.include(csv, '"a, b, c"')
  })

  test('escapes values containing double quotes', ({ assert }) => {
    const csv = toCsv(['label'], [['she said "hi"']])
    assert.include(csv, '"she said ""hi"""')
  })

  test('escapes values containing newlines', ({ assert }) => {
    const csv = toCsv(['label'], [['line1\nline2']])
    assert.include(csv, '"line1\nline2"')
  })

  test('renders null/undefined as empty', ({ assert }) => {
    const csv = toCsv(['a', 'b', 'c'], [[null, undefined, 42]])
    assert.equal(csv, 'a,b,c\n,,42\n')
  })
})
