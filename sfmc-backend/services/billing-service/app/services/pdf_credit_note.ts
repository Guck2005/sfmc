import PDFDocument from 'pdfkit'
import { PassThrough } from 'node:stream'
import type CreditNote from '#models/credit_note'
import type Invoice from '#models/invoice'

/**
 * PDF d’avoir (note de crédit) lié à une facture réglée puis annulée.
 */
export async function buildCreditNotePdf(
  creditNote: CreditNote,
  invoice: Invoice
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  const stream = new PassThrough()
  const chunks: Buffer[] = []
  stream.on('data', (c) => chunks.push(c))
  doc.pipe(stream)

  doc
    .fontSize(20)
    .fillColor('#5d4037')
    .text('SFMC Bénin', 50, 50, { align: 'left' })
    .fontSize(10)
    .fillColor('#333')
    .text('Société de Fabrication et de Maintenance du Centre', 50, 75)
    .text('Cotonou — Bénin', 50, 90)

  doc
    .fontSize(18)
    .fillColor('#000')
    .text('AVOIR (NOTE DE CRÉDIT)', 320, 50, { align: 'right' })
    .fontSize(10)
    .text(`N° avoir : ${creditNote.id}`, 320, 75, { align: 'right' })
    .text(`Date : ${creditNote.createdAt?.toFormat('dd/MM/yyyy') ?? '-'}`, 320, 90, { align: 'right' })
    .text(
      `Facture d’origine : ${invoice.invoiceNumber ?? invoice.id}`,
      320,
      105,
      { align: 'right' }
    )

  doc.moveTo(50, 130).lineTo(550, 130).strokeColor('#5d4037').lineWidth(1).stroke()

  doc
    .moveDown(2)
    .fillColor('#000')
    .fontSize(11)
    .text('Motif', 50, 150, { underline: true })
    .fontSize(10)
    .text(creditNote.reason ?? 'Annulation de commande après paiement', 50, 168, { width: 480 })

  doc
    .fontSize(11)
    .fillColor('#5d4037')
    .text('Références', 50, 230, { underline: true })
    .fontSize(10)
    .fillColor('#000')
    .text(
      `Commande : ${invoice.orderPublicNumber ?? creditNote.orderId}`,
      50,
      248
    )
    .text(`Client ID : ${creditNote.customerId ?? '(anonyme)'}`, 50, 263)

  const boxTop = 310
  doc
    .rect(50, boxTop, 500, 80)
    .strokeColor('#5d4037')
    .lineWidth(1)
    .stroke()
    .fontSize(12)
    .fillColor('#000')
    .text('Montant de l’avoir (crédit client)', 70, boxTop + 15)
    .fontSize(16)
    .fillColor('#b71c1c')
    .text(formatAmount(creditNote.amount, creditNote.currency), 70, boxTop + 40)

  doc
    .fillColor('#555')
    .fontSize(9)
    .text(
      'Ce document atteste du montant à créditer ou à rembourser suite à l’annulation de la commande référencée.',
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

function formatAmount(amount: number, currency: string): string {
  const n = Number(amount)
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 0 })} ${currency}`
}
