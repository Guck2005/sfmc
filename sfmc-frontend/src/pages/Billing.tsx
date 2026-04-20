import { useQuery } from '@tanstack/react-query'
import { Download, FileText } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { billingService } from '@/services'
import { asArray } from '@/lib/pagination'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DataTableEmpty } from '@/components/DataTableEmpty'
import type { Invoice, InvoiceStatus } from '@/types/domain'
import { useAuthStore } from '@/stores/auth-store'

const STATUS_COLORS: Record<InvoiceStatus, 'default' | 'secondary' | 'outline' | 'success' | 'destructive' | 'warning'> = {
  DRAFT: 'outline',
  PENDING: 'warning',
  PAID: 'success',
  OVERDUE: 'destructive',
  CANCELLED: 'secondary',
}

export default function BillingPage() {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.user?.role)
  const userId = useAuthStore((s) => s.user?.id)
  const isClient = role === 'CLIENT'
  const { data, isLoading } = useQuery({
    queryKey: ['invoices', isClient ? userId : 'all'],
    queryFn: () => billingService.listInvoices({ limit: 100 }),
  })

  const invoices = asArray<Invoice>(data)

  const downloadPdf = async (invoiceId: string, invoiceNumber: string) => {
    const res = await fetch(`/api/v1/invoices/${invoiceId}/pdf`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    })
    if (!res.ok) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isClient ? 'Mes factures' : 'Factures'}</CardTitle>
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
                <TableHead>Échéance</TableHead>
                <TableHead className="text-right">PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-xs">{inv.invoiceNumber}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{inv.orderId.slice(0, 8)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[inv.status]}>{inv.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(Number(inv.amount), inv.currency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(inv.dueDate)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => downloadPdf(inv.id, inv.invoiceNumber)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
