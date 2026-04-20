import type { HttpContext } from '@adonisjs/core/http'
import Invoice from '#models/invoice'
import Payment from '#models/payment'
import vine from '@vinejs/vine'
import { buildInvoicePdf } from '#services/pdf_invoice'

const INVOICE_STATUSES = ['PENDING', 'PAID', 'CANCELLED'] as const

function currentUser(ctx: HttpContext): { id: string; email: string; role: string } | null {
  return (ctx as any).auth ?? null
}

function isClient(ctx: HttpContext): boolean {
  return currentUser(ctx)?.role === 'CLIENT'
}

/**
 * Vérifie que le CLIENT qui accède à une facture en est bien le destinataire.
 * Retourne `true` si OK (ou si le rôle n'est pas CLIENT), sinon envoie un 403
 * directement et retourne `false`.
 */
function ensureClientOwnership(ctx: HttpContext, invoice: Invoice): boolean {
  const user = currentUser(ctx)
  if (!user || user.role !== 'CLIENT') return true
  if (invoice.customerId && invoice.customerId !== user.id) {
    ctx.response.forbidden({
      error: { code: 'FORBIDDEN', message: 'Accès refusé à cette facture' },
    })
    return false
  }
  return true
}

export default class InvoicesController {
  /**
   * GET /api/v1/invoices
   *
   * Un CLIENT ne voit QUE ses propres factures (le paramètre `customerId`
   * du query-string est ignoré au profit de son `auth.id`).
   */
  public async index(ctx: HttpContext) {
    const { request, response } = ctx
    const page = Number(request.input('page', 1))
    const limit = Math.min(Number(request.input('limit', 20)), 100)
    const status = request.input('status') as (typeof INVOICE_STATUSES)[number] | undefined
    const rawCustomerId = request.input('customerId') as string | undefined
    const orderId = request.input('orderId') as string | undefined

    const user = currentUser(ctx)
    const customerId = user?.role === 'CLIENT' ? user.id : rawCustomerId

    const query = Invoice.query().orderBy('createdAt', 'desc')
    if (status) query.where('status', status)
    if (customerId) query.where('customerId', customerId)
    if (orderId) query.where('orderId', orderId)

    const result = await query.paginate(page, limit)
    return response.ok({
      data: result.all(),
      meta: {
        total: result.total,
        currentPage: result.currentPage,
        perPage: result.perPage,
        lastPage: result.lastPage,
      },
    })
  }

  public async listPayments(ctx: HttpContext) {
    const { params, response } = ctx
    const invoice = await Invoice.findOrFail(params.id)
    if (!ensureClientOwnership(ctx, invoice)) return
    const payments = await Payment.query()
      .where('invoiceId', params.id)
      .orderBy('createdAt', 'desc')
    return response.ok({ data: payments })
  }

  public async show(ctx: HttpContext) {
    const { params, response } = ctx
    const invoice = await Invoice.query()
      .where('id', params.id)
      .preload('payments')
      .firstOrFail()
    if (!ensureClientOwnership(ctx, invoice)) return
    return response.ok({ data: invoice })
  }

  /**
   * POST /api/v1/invoices/:id/payments
   * Un CLIENT ne peut pas enregistrer de paiement — réservé OPERATOR/ADMIN.
   */
  public async recordPayment(ctx: HttpContext) {
    const { params, request, response } = ctx
    if (isClient(ctx)) {
      return response.forbidden({
        error: {
          code: 'FORBIDDEN',
          message: "Enregistrement de paiement réservé à l'équipe finance",
        },
      })
    }
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

  public async pdf(ctx: HttpContext) {
    const { params, response } = ctx
    const invoice = await Invoice.findOrFail(params.id)
    if (!ensureClientOwnership(ctx, invoice)) return
    const pdf = await buildInvoicePdf(invoice)

    response.header('Content-Type', 'application/pdf')
    response.header('Content-Disposition', `attachment; filename=invoice-${invoice.id}.pdf`)
    response.header('Content-Length', String(pdf.length))
    return response.send(pdf)
  }
}
