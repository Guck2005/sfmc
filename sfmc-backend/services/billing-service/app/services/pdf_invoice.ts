import PDFDocument from 'pdfkit'
import { PassThrough } from 'node:stream'
import Invoice from '#models/invoice'
import Payment from '#models/payment'
import { formatPdfAmount } from '#services/pdf_amount_format'

/**
 * Generates a Buffer containing a PDF representation of an invoice.
 * Keeps layout self-contained (no external fonts / images), so the PDF works
 * in K8s pods without mounting any extra volume.
 */
export async function buildInvoicePdf(invoice: Invoice): Promise<Buffer> {
  const payments = await Payment.query().where('invoiceId', invoice.id).orderBy('createdAt', 'asc')
  const totalPaid = payments.reduce((acc, p) => acc + Number(p.amount), 0)
  const remaining = Math.max(0, Number(invoice.amount) - totalPaid)
  const displayInvoiceNo = invoice.invoiceNumber ?? invoice.id
  const orderLabel = invoice.orderPublicNumber ?? invoice.orderId

  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  const stream = new PassThrough()
  const chunks: Buffer[] = []
  stream.on('data', (c) => chunks.push(c))
  doc.pipe(stream)

  // ---- Header ---------------------------------------------------------------
  doc
    .fontSize(20)
    .fillColor('#0a3d62')
    .text('SFMC Bénin', 50, 50, { align: 'left' })
    .fontSize(10)
    .fillColor('#333')
    .text('Société de Fabrication et de Maintenance du Centre', 50, 75)
    .text('Cotonou — Bénin', 50, 90)

  doc
    .fontSize(18)
    .fillColor('#000')
    .text('FACTURE', 400, 50, { align: 'right' })
    .fontSize(10)
    .text(`N° : ${displayInvoiceNo}`, 400, 75, { align: 'right' })
    .text(`Date : ${invoice.createdAt?.toFormat('dd/MM/yyyy') ?? '-'}`, 400, 90, { align: 'right' })
    .text(`Statut : ${invoice.status}`, 400, 105, { align: 'right' })

  doc.moveTo(50, 130).lineTo(550, 130).strokeColor('#0a3d62').lineWidth(1).stroke()

  // ---- Customer block -------------------------------------------------------
  doc
    .moveDown(2)
    .fillColor('#000')
    .fontSize(11)
    .text('Client', 50, 150, { underline: true })
    .fontSize(10)
    .text(`Client ID : ${invoice.customerId ?? '(anonyme)'}`, 50, 168)
    .text(`Commande  : ${orderLabel}`, 50, 183)

  // ---- Lines table ----------------------------------------------------------
  const tableTop = 230
  doc
    .fontSize(11)
    .fillColor('#0a3d62')
    .text('Désignation', 50, tableTop)
    .text('Qté', 300, tableTop, { width: 60, align: 'right' })
    .text('P.U.', 370, tableTop, { width: 80, align: 'right' })
    .text('Total', 460, tableTop, { width: 80, align: 'right' })

  doc.moveTo(50, tableTop + 18).lineTo(550, tableTop + 18).strokeColor('#0a3d62').stroke()

  // The invoice aggregates the whole order — detailed lines live in order-service.
  // We show a single synthetic row referencing the order id. If a future
  // migration carries per-line data, this section can iterate over them.
  const row = tableTop + 30
  doc
    .fillColor('#000')
    .fontSize(10)
    .text(`Commande ${orderLabel}`, 50, row, { width: 240 })
    .text('1', 300, row, { width: 60, align: 'right' })
    .text(formatPdfAmount(invoice.amount, invoice.currency), 370, row, { width: 80, align: 'right' })
    .text(formatPdfAmount(invoice.amount, invoice.currency), 460, row, { width: 80, align: 'right' })

  // ---- Totals / payments ----------------------------------------------------
  const totalsTop = row + 50
  doc
    .moveTo(300, totalsTop - 10).lineTo(550, totalsTop - 10).strokeColor('#0a3d62').stroke()
    .fontSize(10)
    .text('Total facture', 300, totalsTop, { width: 160, align: 'right' })
    .text(formatPdfAmount(invoice.amount, invoice.currency), 460, totalsTop, {
      width: 80,
      align: 'right',
    })
    .text('Total payé', 300, totalsTop + 18, { width: 160, align: 'right' })
    .text(formatPdfAmount(totalPaid, invoice.currency), 460, totalsTop + 18, {
      width: 80,
      align: 'right',
    })
    .fillColor(remaining > 0 ? '#b71c1c' : '#1b5e20')
    .text('Reste à payer', 300, totalsTop + 36, { width: 160, align: 'right' })
    .text(formatPdfAmount(remaining, invoice.currency), 460, totalsTop + 36, {
      width: 80,
      align: 'right',
    })

  // ---- Footer ---------------------------------------------------------------
  doc
    .fillColor('#555')
    .fontSize(9)
    .text(
      'Conditions de paiement : 30 jours à compter de la date d\'émission. ' +
        'Tout retard donne lieu à un intérêt de 1 % / mois.',
      50,
      720,
      { width: 500 }
    )
    .text(`SFMC Bénin — Document généré le ${new Date().toISOString()}`, 50, 760, {
      width: 500,
      align: 'center',
    })

  doc.end()

  await new Promise<void>((resolve, reject) => {
    stream.on('end', resolve)
    stream.on('error', reject)
  })

  return Buffer.concat(chunks)
}
