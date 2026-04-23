import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

function parseLocalDay(d: string): Date | null {
  if (!d) return null
  const t = new Date(`${d}T00:00:00`)
  return Number.isNaN(t.getTime()) ? null : t
}

function orderInCreatedRange(order: Order, from: string, to: string): boolean {
  const start = parseLocalDay(from)
  const end = parseLocalDay(to)
  if (!start && !end) return true
  const d = new Date(order.createdAt)
  if (start && d < start) return false
  if (end) {
    const endPlus = new Date(end)
    endPlus.setHours(23, 59, 59, 999)
    if (d > endPlus) return false
  }
  return true
}

function downloadOrdersCsv(rows: Order[]) {
  const headers = ['orderNumber', 'id', 'customerId', 'status', 'totalAmount', 'currency', 'createdAt']
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const lines = [
    headers.join(','),
    ...rows.map((o) =>
      [
        o.orderNumber ?? '',
        o.id,
        o.customerId,
        o.status,
        o.totalAmount,
        o.currency,
        o.createdAt,
      ]
        .map(esc)
        .join(','),
    ),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `orders_export_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
import { toast } from 'sonner'
import { Download, Loader2, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { RowActionsMenu } from '@/components/RowActionsMenu'
import { ordersService, productsService } from '@/services'
import { asArray } from '@/lib/pagination'
import { extractErrorMessage } from '@/lib/api'
import { DataTableEmpty } from '@/components/DataTableEmpty'
import { useAuthStore } from '@/stores/auth-store'
import type { Order, OrderStatus, Product } from '@/types/domain'

const STATUS_COLORS: Record<OrderStatus, 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive'> = {
  PENDING: 'outline',
  VALIDATED: 'secondary',
  IN_PRODUCTION: 'warning',
  READY: 'secondary',
  SHIPPED: 'default',
  DELIVERED: 'success',
  CANCELLED: 'destructive',
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'En attente',
  VALIDATED: 'Validée',
  IN_PRODUCTION: 'En production',
  READY: 'Prête',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
}

const orderSchema = z.object({
  customerId: z.string().uuid('Identifiant client requis'),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid('Choisissez un produit'),
        quantity: z.coerce.number().int().min(1),
        unitPrice: z.coerce.number().min(0),
      })
    )
    .min(1, 'Au moins une ligne'),
})
type OrderFormIn = z.input<typeof orderSchema>
type OrderFormOut = z.output<typeof orderSchema>

export default function OrdersPage() {
  const [open, setOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [customerIdFilter, setCustomerIdFilter] = useState('')
  const qc = useQueryClient()
  const role = useAuthStore((s) => s.user?.role)
  const userId = useAuthStore((s) => s.user?.id)
  const isClient = role === 'CLIENT'
  const isAdmin = role === 'ADMIN'

  const listParams = useMemo(() => {
    const p: {
      limit: number
      status?: OrderStatus
      customerId?: string
    } = { limit: 100 }
    if (statusFilter !== 'ALL') p.status = statusFilter
    if (isClient && userId) p.customerId = userId
    else if (!isClient) {
      const parsed = z.string().uuid().safeParse(customerIdFilter.trim())
      if (parsed.success) p.customerId = parsed.data
    }
    return p
  }, [statusFilter, isClient, userId, customerIdFilter])

  const { data, isLoading } = useQuery({
    queryKey: ['orders', listParams],
    queryFn: () => ordersService.list(listParams),
    refetchInterval: 20_000,
  })

  const { data: productsData } = useQuery({
    queryKey: ['products-lite'],
    queryFn: () => productsService.list({ limit: 200 }),
  })

  const ordersRaw = asArray<Order>(data)
  const orders = useMemo(
    () => ordersRaw.filter((o) => orderInCreatedRange(o, fromDate, toDate)),
    [ordersRaw, fromDate, toDate]
  )
  const products = asArray<Product>(productsData)
  const productMap = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products]
  )

  const form = useForm<OrderFormIn, unknown, OrderFormOut>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      customerId: isClient ? (userId ?? '') : '',
      lines: [{ productId: '', quantity: 1, unitPrice: 0 }],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  })

  const createMutation = useMutation({
    mutationFn: (payload: OrderFormOut) => ordersService.create(payload),
    onSuccess: () => {
      toast.success('Commande créée — traitement automatique en cours')
      qc.invalidateQueries({ queryKey: ['orders'] })
      setOpen(false)
      form.reset({
        customerId: isClient ? (userId ?? '') : '',
        lines: [{ productId: '', quantity: 1, unitPrice: 0 }],
      })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => ordersService.cancel(id),
    onSuccess: () => {
      toast.success('Commande annulée')
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ordersService.remove(id),
    onSuccess: () => {
      toast.success('Commande supprimée')
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const cancellableStatuses = ['PENDING', 'VALIDATED', 'IN_PRODUCTION', 'READY'] as const
  const canShowCancel = (o: Order) =>
    cancellableStatuses.includes(o.status as (typeof cancellableStatuses)[number]) &&
    (!isClient || o.customerId === userId)

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 space-y-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>{isClient ? 'Mes commandes' : 'Commandes'}</CardTitle>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as OrderStatus | 'ALL')}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous statuts</SelectItem>
                {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              className="w-[11rem]"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="Créées depuis"
            />
            <Input
              type="date"
              className="w-[11rem]"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="Créées jusqu’au"
            />
            {!isClient && (
              <Input
                className="w-56 font-mono text-xs"
                placeholder="Identifiant client (optionnel)"
                value={customerIdFilter}
                onChange={(e) => setCustomerIdFilter(e.target.value)}
              />
            )}
            {orders.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => downloadOrdersCsv(orders)}>
                <Download className="h-3.5 w-3.5 mr-1" />
                Tableur
              </Button>
            )}
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              Nouvelle commande
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nouvelle commande</DialogTitle>
              <DialogDescription>
                La commande déclenchera la saga de validation inter-services (stock, production,
                facturation).
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
              className="space-y-4"
            >
              {isClient ? (
                <input
                  type="hidden"
                  {...form.register('customerId')}
                  value={userId ?? ''}
                  readOnly
                />
              ) : (
                <div className="space-y-1">
                  <Label>Identifiant client</Label>
                  <Input {...form.register('customerId')} placeholder="Identifiant du compte client" />
                  {form.formState.errors.customerId && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.customerId.message}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Lignes</Label>
                {fields.map((f, idx) => (
                  <div key={f.id} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-6">
                      <Select
                        value={form.watch(`lines.${idx}.productId`)}
                        onValueChange={(v) => {
                          form.setValue(`lines.${idx}.productId`, v)
                          const p = productMap[v]
                          if (p) form.setValue(`lines.${idx}.unitPrice`, p.unitPrice)
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Produit…" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.unit} — {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      placeholder="Qté"
                      className="col-span-2"
                      {...form.register(`lines.${idx}.quantity`)}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="PU"
                      className="col-span-3"
                      {...form.register(`lines.${idx}.unitPrice`)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(idx)}
                      disabled={fields.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ productId: '', quantity: 1, unitPrice: 0 })}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Ajouter une ligne
                </Button>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Créer la commande
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Chargement…</div>
        ) : orders.length === 0 ? (
          <DataTableEmpty message="Aucune commande enregistrée" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° commande</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="align-middle max-w-[14rem]">
                    <div className="font-medium text-sm">{o.orderNumber ?? o.id.slice(0, 8) + '…'}</div>
                    {!o.orderNumber && (
                      <div className="truncate font-mono text-[10px] text-muted-foreground" title={o.id}>
                        {o.id}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="align-middle">
                    <div className="font-medium text-sm">
                      {o.customerDisplayName?.trim() ||
                        (isClient ? 'Moi' : `Client ${o.customerId.slice(0, 8)}…`)}
                    </div>
                  </TableCell>
                  <TableCell className="align-middle">
                    <Badge variant={STATUS_COLORS[o.status]}>{STATUS_LABELS[o.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right align-middle">
                    <div className="flex justify-end">
                      <RowActionsMenu ariaLabel={`Actions commande ${o.id.slice(0, 8)}`}>
                        <DropdownMenuItem asChild>
                          <Link to={`/orders/${o.id}`}>Voir détail</Link>
                        </DropdownMenuItem>
                        {canShowCancel(o) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                if (confirm('Annuler cette commande ?')) {
                                  cancelMutation.mutate(o.id)
                                }
                              }}
                            >
                              Annuler
                            </DropdownMenuItem>
                          </>
                        )}
                        {isAdmin && canShowCancel(o) && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  'Supprimer définitivement cette commande ? Les stocks et la facturation seront ajustés en conséquence.'
                                )
                              ) {
                                deleteMutation.mutate(o.id)
                              }
                            }}
                          >
                            Supprimer définitivement
                          </DropdownMenuItem>
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
    </Card>
  )
}
