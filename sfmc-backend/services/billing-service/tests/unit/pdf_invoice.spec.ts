import { test } from '@japa/runner'
import { buildInvoicePdf } from '#services/pdf_invoice'
import { DateTime } from 'luxon'

// Minimal Invoice stub — pdf_invoice.ts only accesses columns, not Lucid.
function fakeInvoice(overrides: Record<string, any> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    invoiceNumber: 'FAC-2026-000099',
    orderPublicNumber: 'CMD-2026-000042',
    orderId: '22222222-2222-2222-2222-222222222222',
    customerId: '33333333-3333-3333-3333-333333333333',
    amount: 15500,
    currency: 'XOF',
    status: 'PENDING',
    createdAt: DateTime.fromISO('2026-04-19T10:00:00'),
    ...overrides,
  } as any
}

test.group('pdf_invoice.buildInvoicePdf', () => {
  test('returns a valid PDF buffer with the %PDF magic header', async ({ assert }) => {
    // The payments relation query will hit the DB; stub Payment.query for this unit test
    const Payment = (await import('#models/payment')).default as any
    const originalQuery = Payment.query
    Payment.query = () => ({
      where: () => ({ orderBy: async () => [] }),
    })
    try {
      const buf = await buildInvoicePdf(fakeInvoice())
      assert.isTrue(Buffer.isBuffer(buf))
      assert.isAbove(buf.length, 500)
      assert.equal(buf.slice(0, 4).toString('ascii'), '%PDF')
    } finally {
      Payment.query = originalQuery
    }
  })
})
