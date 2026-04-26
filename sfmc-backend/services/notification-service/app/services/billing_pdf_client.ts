import jwt from 'jsonwebtoken'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

function billingBaseUrl(): string {
  const raw = env.get('BILLING_SERVICE_URL')?.trim()
  return (raw && raw.length > 0 ? raw : 'http://127.0.0.1:3007').replace(/\/$/, '')
}

function interServiceJwt(): string {
  return jwt.sign(
    {
      sub: '00000000-0000-4000-8000-0000000000notif',
      email: 'notifications@sfmc.internal',
      role: 'ADMIN',
    },
    env.get('JWT_SECRET'),
    { expiresIn: '2m' }
  )
}

export async function fetchInvoicePdfBuffer(invoiceId: string): Promise<Buffer | null> {
  const url = `${billingBaseUrl()}/api/v1/invoices/${encodeURIComponent(invoiceId)}/pdf`
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${interServiceJwt()}` },
    })
    if (!res.ok) {
      logger.warn({ status: res.status, invoiceId }, '[notification] invoice PDF fetch failed')
      return null
    }
    return Buffer.from(await res.arrayBuffer())
  } catch (err) {
    logger.warn({ err, invoiceId }, '[notification] invoice PDF fetch error')
    return null
  }
}

export async function fetchCreditNotePdfBuffer(invoiceId: string): Promise<Buffer | null> {
  const url = `${billingBaseUrl()}/api/v1/invoices/${encodeURIComponent(invoiceId)}/credit-note/pdf`
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${interServiceJwt()}` },
    })
    if (!res.ok) {
      logger.warn({ status: res.status, invoiceId }, '[notification] credit-note PDF fetch failed')
      return null
    }
    return Buffer.from(await res.arrayBuffer())
  } catch (err) {
    logger.warn({ err, invoiceId }, '[notification] credit-note PDF fetch error')
    return null
  }
}

export function safeInvoicePdfFilename(invoiceNumber: string | undefined, invoiceId: string): string {
  const base = (invoiceNumber ?? invoiceId).replace(/[^\w.-]+/g, '_')
  return `facture-${base}.pdf`
}

export function safeCreditNotePdfFilename(creditNoteId: string): string {
  const base = creditNoteId.replace(/[^\w.-]+/g, '_')
  return `avoir-${base}.pdf`
}
