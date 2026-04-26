import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import Invoice from '#models/invoice'
import CreditNote from '#models/credit_note'
import Payment from '#models/payment'
import vine from '@vinejs/vine'
import type { InvoicePaidPayload } from '@sfmc/event-contracts'
import { buildInvoicePdf } from '#services/pdf_invoice'
import { buildCreditNotePdf } from '#services/pdf_credit_note'
import { publishBillingEvent } from '#services/billing_event_publish'

const INVOICE_STATUSES = ['PENDING', 'PAID', 'CANCELLED', 'REFUNDED'] as const

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
    const previousStatus = invoice.status

    if (invoice.status === 'CANCELLED' || invoice.status === 'REFUNDED') {
      return response.unprocessableEntity({
        error: {
          code: 'INVOICE_NOT_PAYABLE',
          message: 'Impossible d’enregistrer un paiement sur une facture annulée ou remboursée',
        },
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

    if (invoice.status === 'PAID' && previousStatus !== 'PAID') {
      const paidPayload: InvoicePaidPayload = {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        orderId: invoice.orderId,
        orderNumber: invoice.orderPublicNumber ?? undefined,
        customerId: invoice.customerId,
        customerEmail: invoice.customerEmail ?? undefined,
        amount: Number(invoice.amount),
        currency: invoice.currency,
      }
      try {
        await publishBillingEvent(
          'billing.invoice_paid',
          paidPayload as unknown as Record<string, unknown>,
          invoice.orderId
        )
      } catch (err) {
        logger.warn({ err, invoiceId: invoice.id }, '[billing] failed to publish invoice_paid')
      }
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
    const safeName = invoice.invoiceNumber?.replace(/[^\w.-]+/g, '_')
    response.header(
      'Content-Disposition',
      `attachment; filename=${safeName ? `facture-${safeName}` : `invoice-${invoice.id}`}.pdf`
    )
    response.header('Content-Length', String(pdf.length))
    return response.send(pdf)
  }

  /**
   * GET /api/v1/invoices/:id/credit-note
   * Ressource « avoir » si la facture a été remboursée (annulation post-paiement).
   */
  public async creditNote(ctx: HttpContext) {
    const { params, response } = ctx
    const invoice = await Invoice.findOrFail(params.id)
    if (!ensureClientOwnership(ctx, invoice)) return
    if (invoice.status !== 'REFUNDED') {
      return response.notFound({
        error: {
          code: 'CREDIT_NOTE_NOT_FOUND',
          message: 'Aucun avoir pour cette facture',
        },
      })
    }
    const note = await CreditNote.findBy('invoiceId', invoice.id)
    if (!note) {
      return response.notFound({
        error: {
          code: 'CREDIT_NOTE_NOT_FOUND',
          message: 'Avoir non trouvé — contactez la finance.',
        },
      })
    }
    return response.ok({ data: note })
  }

  /**
   * GET /api/v1/invoices/:id/credit-note/pdf
   */
  public async creditNotePdf(ctx: HttpContext) {
    const { params, response } = ctx
    const invoice = await Invoice.findOrFail(params.id)
    if (!ensureClientOwnership(ctx, invoice)) return
    if (invoice.status !== 'REFUNDED') {
      return response.notFound({
        error: {
          code: 'CREDIT_NOTE_NOT_FOUND',
          message: 'Aucun avoir pour cette facture',
        },
      })
    }
    const note = await CreditNote.findBy('invoiceId', invoice.id)
    if (!note) {
      return response.notFound({
        error: {
          code: 'CREDIT_NOTE_NOT_FOUND',
          message: 'Avoir non trouvé.',
        },
      })
    }
    const pdf = await buildCreditNotePdf(note, invoice)
    response.header('Content-Type', 'application/pdf')
    response.header(
      'Content-Disposition',
      `attachment; filename=credit-note-${note.id}.pdf`
    )
    response.header('Content-Length', String(pdf.length))
    return response.send(pdf)
  }
}
