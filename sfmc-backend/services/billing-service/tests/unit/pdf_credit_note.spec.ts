import { test } from '@japa/runner'
import { buildCreditNotePdf } from '#services/pdf_credit_note'
import { DateTime } from 'luxon'

test.group('pdf_credit_note.buildCreditNotePdf', () => {
  test('returns a valid PDF buffer with the %PDF magic header', async ({ assert }) => {
    const cn = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      invoiceId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      orderId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      customerId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      amount: 15000,
      currency: 'XOF',
      reason: 'Annulation commande après paiement',
      createdAt: DateTime.fromISO('2026-04-19T10:00:00'),
    } as any

    const inv = {
      id: cn.invoiceId,
      invoiceNumber: 'FAC-2026-000055',
      orderPublicNumber: 'CMD-2026-000044',
      orderId: cn.orderId,
      customerId: cn.customerId,
      amount: 15000,
      currency: 'XOF',
      status: 'REFUNDED',
      createdAt: DateTime.fromISO('2026-04-18T10:00:00'),
    } as any

    const buf = await buildCreditNotePdf(cn, inv)
    assert.isTrue(Buffer.isBuffer(buf))
    assert.isAbove(buf.length, 400)
    assert.equal(buf.slice(0, 4).toString('ascii'), '%PDF')
  })
})
