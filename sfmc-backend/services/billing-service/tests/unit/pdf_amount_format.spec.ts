import { test } from '@japa/runner'
import { formatPdfAmount } from '#services/pdf_amount_format'

test.group('formatPdfAmount', () => {
  test('uses ASCII space for thousands so PDF text is not garbled', async ({ assert }) => {
    const s = formatPdfAmount(1200, 'XOF')
    assert.include(s, '1')
    assert.include(s, '200')
    assert.include(s, 'XOF')
    assert.notInclude(s, '\u202f')
    assert.notInclude(s, '\u00a0')
    assert.match(s, /1 200 XOF/)
  })

  test('small amounts have no thousands separator', async ({ assert }) => {
    assert.equal(formatPdfAmount(0, 'XOF'), '0 XOF')
    assert.equal(formatPdfAmount(42, 'XOF'), '42 XOF')
  })
})
