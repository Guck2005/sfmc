import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Download, FileText, Loader2, Receipt } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { RowActionsMenu } from '@/components/RowActionsMenu'
import { billingService } from '@/services'
import { asArray } from '@/lib/pagination'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DataTableEmpty } from '@/components/DataTableEmpty'
import type { Invoice, InvoiceStatus, Payment } from '@/types/domain'
import { useAuthStore } from '@/stores/auth-store'
import { extractErrorMessage } from '@/lib/api'

const STATUS_COLORS: Record<
  InvoiceStatus,
  'default' | 'secondary' | 'outline' | 'success' | 'destructive' | 'warning'
> = {
  PENDING: 'warning',
  PAID: 'success',
  CANCELLED: 'secondary',
  REFUNDED: 'outline',
}

const ALL_INVOICE_STATUS: InvoiceStatus[] = ['PENDING', 'PAID', 'CANCELLED', 'REFUNDED']

const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  PENDING: 'En attente de paiement',
  PAID: 'Payée',
  CANCELLED: 'Annulée',
  REFUNDED: 'Remboursée',
}

const paymentSchema = z.object({
  amount: z.number().refine((n) => Number.isFinite(n) && n > 0, { message: 'Montant invalide' }),
  method: z.enum(['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER']),
})
type PaymentForm = z.infer<typeof paymentSchema>

const PAYMENT_METHOD_LABELS: Record<PaymentForm['method'], string> = {
  CASH: 'Espèces',
  MOBILE_MONEY: 'Mobile money',
  BANK_TRANSFER: 'Virement bancaire',
}

function parseLocalDate(d: string): Date | null {
  if (!d) return null
  const t = new Date(`${d}T00:00:00`)
  return Number.isNaN(t.getTime()) ? null : t
}

export default function BillingPage() {
  const { invoiceId } = useParams()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.user?.role)
  const userId = useAuthStore((s) => s.user?.id)
  const isClient = role === 'CLIENT'
  const canFinance = role === 'ADMIN' || role === 'OPERATOR'
  const invoicesBase = isClient ? '/my-invoices' : '/billing'

  const [statusFilter, setStatusFilter] = useState<string>('__all__')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null)

  const detailId = invoiceId ?? null

  const qc = useQueryClient()

  const listParams = useMemo(() => {
    const p: { limit: number; status?: string; customerId?: string } = { limit: 100 }
    if (statusFilter !== '__all__') p.status = statusFilter
    if (isClient && userId) p.customerId = userId
    return p
  }, [statusFilter, isClient, userId])

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', listParams],
    queryFn: () => billingService.listInvoices(listParams),
  })

  const { data: detailInvoice, isFetching: loadingDetail } = useQuery({
    queryKey: ['invoice', detailId],
    queryFn: () => billingService.get(detailId!),
    enabled: !!detailId,
  })

  const { data: payments = [] } = useQuery({
    queryKey: ['invoice-payments', detailId],
    queryFn: () => billingService.listPayments(detailId!),
    enabled: !!detailId,
  })

  const paymentForm = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { method: 'CASH', amount: 0 },
  })

  const payMutation = useMutation({
    mutationFn: (v: PaymentForm) =>
      billingService.recordPayment(paymentInvoice!.id, {
        amount: v.amount,
        method: v.method,
      }),
    onSuccess: () => {
      toast.success('Paiement enregistré')
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoice', paymentInvoice?.id] })
      qc.invalidateQueries({ queryKey: ['invoice-payments', paymentInvoice?.id] })
      setPaymentInvoice(null)
      paymentForm.reset({ method: 'CASH', amount: 0 })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const rawInvoices = asArray<Invoice>(data)

  const invoices = useMemo(() => {
    const from = parseLocalDate(fromDate)
    const to = parseLocalDate(toDate)
    if (!from && !to) return rawInvoices
    return rawInvoices.filter((inv) => {
      const d = new Date(inv.createdAt)
      if (from && d < from) return false
      if (to) {
        const end = new Date(to)
        end.setHours(23, 59, 59, 999)
        if (d > end) return false
      }
      return true
    })
  }, [rawInvoices, fromDate, toDate])

  const downloadPdf = async (invoiceId: string, invoiceNumber: string) => {
    const res = await fetch(`/api/v1/invoices/${invoiceId}/pdf`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    })
    if (!res.ok) {
      toast.error('Téléchargement PDF impossible')
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${invoiceNumber || invoiceId}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadCreditPdf = async (invoiceId: string) => {
    const res = await fetch(billingService.creditNotePdfUrl(invoiceId), {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    })
    if (!res.ok) {
      toast.error('Pas d’avoir PDF pour cette facture')
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `credit-note-${invoiceId.slice(0, 8)}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isClient ? 'Mes factures' : 'Factures'}</CardTitle>
        <CardDescription>
          {isClient
            ? 'Vos factures et leur statut de paiement.'
            : 'Filtrez par statut et par période (date de création).'}
        </CardDescription>
        {!isClient && (
          <div className="flex flex-wrap gap-3 pt-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tous</SelectItem>
                {ALL_INVOICE_STATUS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {INVOICE_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Du</Label>
              <Input type="date" className="w-[150px]" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Au</Label>
              <Input type="date" className="w-[150px]" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Chargement…</div>
        ) : invoices.length === 0 ? (
          <DataTableEmpty message="Aucune facture émise" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Commande</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow
                  key={inv.id}
                  className="cursor-pointer"
                  title="Voir le détail de la facture"
                  onClick={() => navigate(`${invoicesBase}/${inv.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-xs">
                        {inv.invoiceNumber ?? inv.id.slice(0, 8) + '…'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[12rem]">
                    <div className="font-medium text-sm">
                      {inv.orderPublicNumber?.trim() || inv.orderId.slice(0, 8) + '…'}
                    </div>
                    {!inv.orderPublicNumber?.trim() && (
                      <div className="truncate font-mono text-[10px] text-muted-foreground" title={inv.orderId}>
                        {inv.orderId}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[inv.status]}>{INVOICE_STATUS_LABELS[inv.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(Number(inv.amount), inv.currency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(inv.dueDate ?? inv.createdAt)}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end">
                      <RowActionsMenu ariaLabel={`Actions facture ${inv.invoiceNumber ?? inv.id.slice(0, 8)}`}>
                        <DropdownMenuItem onClick={() => navigate(`${invoicesBase}/${inv.id}`)}>
                          Détail
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => downloadPdf(inv.id, inv.invoiceNumber ?? inv.id)}>
                          <Download className="mr-2 h-4 w-4" />
                          Télécharger PDF
                        </DropdownMenuItem>
                        {inv.status === 'REFUNDED' && (
                          <DropdownMenuItem onClick={() => downloadCreditPdf(inv.id)}>
                            <Receipt className="mr-2 h-4 w-4" />
                            Avoir PDF
                          </DropdownMenuItem>
                        )}
                        {canFinance &&
                          inv.status !== 'PAID' &&
                          inv.status !== 'CANCELLED' &&
                          inv.status !== 'REFUNDED' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setPaymentInvoice(inv)}>
                                Enregistrer un paiement
                              </DropdownMenuItem>
                            </>
                          )}
                      </RowActionsMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog
        open={!!detailId}
        onOpenChange={(o) => {
          if (!o) navigate(invoicesBase, { replace: true })
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Détail facture</DialogTitle>
          </DialogHeader>
          {loadingDetail || !detailInvoice ? (
            <div className="py-8 flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              {detailInvoice.invoiceNumber ? (
                <div className="space-y-1">
                  <p className="text-muted-foreground">N° facture</p>
                  <p className="text-base font-semibold">{detailInvoice.invoiceNumber}</p>
                </div>
              ) : null}
              {!detailInvoice.invoiceNumber && (
                <div className="space-y-1">
                  <p className="text-muted-foreground">Référence interne</p>
                  <p className="font-mono text-xs">{detailInvoice.id}</p>
                </div>
              )}
              {detailInvoice.orderPublicNumber ? (
                <div className="space-y-1">
                  <p className="text-muted-foreground">N° commande</p>
                  <p className="font-medium">{detailInvoice.orderPublicNumber}</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-muted-foreground">Référence commande</p>
                  <p className="font-mono text-xs">{detailInvoice.orderId}</p>
                </div>
              )}
              <div className="flex gap-4">
                <div>
                  <p className="text-muted-foreground">Statut</p>
                  <Badge variant={STATUS_COLORS[detailInvoice.status]}>
                    {INVOICE_STATUS_LABELS[detailInvoice.status]}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Montant</p>
                  <p className="font-mono">
                    {formatCurrency(Number(detailInvoice.amount), detailInvoice.currency)}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Paiements</p>
                {(payments as Payment[]).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucun paiement enregistré.</p>
                ) : (
                  <ul className="text-xs space-y-1 border rounded-md p-2">
                    {(payments as Payment[]).map((p) => (
                      <li key={p.id} className="flex justify-between gap-2">
                        <span>{PAYMENT_METHOD_LABELS[p.method]}</span>
                        <span className="font-mono">{formatCurrency(Number(p.amount), detailInvoice.currency)}</span>
                        <span className="text-muted-foreground">{formatDate(p.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {detailInvoice.status === 'REFUNDED' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const cn = await billingService.getCreditNote(detailInvoice.id)
                      toast.success(`Avoir ${cn.id.slice(0, 8)}… — ${formatCurrency(Number(cn.amount), cn.currency)}`)
                    } catch (e) {
                      toast.error(extractErrorMessage(e))
                    }
                  }}
                >
                  Afficher le détail de l’avoir
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!paymentInvoice} onOpenChange={(o) => !o && setPaymentInvoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enregistrer un paiement</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={paymentForm.handleSubmit((v) => payMutation.mutate(v))}
            className="space-y-3"
          >
            {paymentInvoice && !paymentInvoice.invoiceNumber && (
              <div className="text-xs text-muted-foreground font-mono">{paymentInvoice.id}</div>
            )}
            {paymentInvoice?.invoiceNumber && (
              <p className="text-sm text-muted-foreground">Facture {paymentInvoice.invoiceNumber}</p>
            )}
            <div className="space-y-1">
              <Label>Montant</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                {...paymentForm.register('amount', { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1">
              <Label>Moyen</Label>
              <Select
                value={paymentForm.watch('method')}
                onValueChange={(m) =>
                  paymentForm.setValue('method', m as PaymentForm['method'], { shouldValidate: true })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">{PAYMENT_METHOD_LABELS.CASH}</SelectItem>
                  <SelectItem value="MOBILE_MONEY">{PAYMENT_METHOD_LABELS.MOBILE_MONEY}</SelectItem>
                  <SelectItem value="BANK_TRANSFER">{PAYMENT_METHOD_LABELS.BANK_TRANSFER}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={payMutation.isPending}>
                {payMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
