import type { HttpContext } from '@adonisjs/core/http'
import Invoice from '#models/invoice'
import Payment from '#models/payment'
import vine from '@vinejs/vine'

export default class InvoicesController {
  /**
   * GET /api/v1/invoices/:id
   * Consultation d'une facture avec ses paiements
   */
  public async show({ params, response }: HttpContext) {
    const invoice = await Invoice.query()
      .where('id', params.id)
      .preload('payments')
      .firstOrFail()

    return response.ok({ data: invoice })
  }

  /**
   * POST /api/v1/invoices/:id/payments
   * Enregistrement d'un paiement sur une facture
   */
  public async recordPayment({ params, request, response }: HttpContext) {
    const invoice = await Invoice.findOrFail(params.id)

    if (invoice.status === 'CANCELLED') {
      return response.unprocessableEntity({
        error: { code: 'INVOICE_CANCELLED', message: 'Impossible de payer une facture annulée' },
      })
    }

    if (invoice.status === 'PAID') {
      return response.unprocessableEntity({
        error: { code: 'INVOICE_ALREADY_PAID', message: 'Cette facture est déjà entièrement payée' },
      })
    }

    const schema = vine.object({
      amount: vine.number().positive(),
      method: vine.enum(['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER']),
    })
    const payload = await request.validateUsing(vine.compile(schema))

    const payment = await Payment.create({
      invoiceId: invoice.id,
      amount: payload.amount,
      method: payload.method,
    })

    // Check if total payments cover the invoice amount
    const totalPaid = await Payment.query()
      .where('invoiceId', invoice.id)
      .sum('amount as total')
      .first()

    const paidAmount = Number(totalPaid?.$extras?.total ?? 0)

    if (paidAmount >= Number(invoice.amount)) {
      invoice.status = 'PAID'
      await invoice.save()
    }

    return response.created({
      data: payment,
      invoiceStatus: invoice.status,
      totalPaid: paidAmount,
      remaining: Math.max(0, Number(invoice.amount) - paidAmount),
    })
  }

  /**
   * GET /api/v1/invoices/:id/pdf
   * Stub — simule la génération de PDF
   */
  public async pdf({ params, response }: HttpContext) {
    const invoice = await Invoice.findOrFail(params.id)

    // Stub: In production, this would generate a real PDF via a library like pdfkit
    return response.ok({
      message: 'PDF generation stub',
      invoiceId: invoice.id,
      orderId: invoice.orderId,
      amount: invoice.amount,
      currency: invoice.currency,
      status: invoice.status,
      downloadUrl: `/api/v1/invoices/${invoice.id}/pdf/download`,
      note: 'Intégration Brevo/PDF réelle prévue au Sprint 4',
    })
  }
}
