import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2 } from 'lucide-react'

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
import { ordersService, productsService } from '@/services'
import { asArray } from '@/lib/pagination'
import { formatCurrency, formatDateTime } from '@/lib/utils'
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
  customerId: z.string().uuid('UUID client requis'),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid('Sélectionner un produit'),
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
  const qc = useQueryClient()
  const role = useAuthStore((s) => s.user?.role)
  const userId = useAuthStore((s) => s.user?.id)
  const isClient = role === 'CLIENT'

  const { data, isLoading } = useQuery({
    queryKey: ['orders', statusFilter, isClient ? userId : 'all'],
    queryFn: () =>
      ordersService.list({
        limit: 100,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      }),
    refetchInterval: 20_000,
  })

  const { data: productsData } = useQuery({
    queryKey: ['products-lite'],
    queryFn: () => productsService.list({ limit: 200 }),
  })

  const orders = asArray<Order>(data)
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
      toast.success('Commande créée — saga en cours')
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

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-3">
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
                  <Label>ID client (UUID)</Label>
                  <Input {...form.register('customerId')} placeholder="UUID du client" />
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
                              {p.sku} — {p.name}
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
                <TableHead>#</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead>Créée</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link
                      to={`/orders/${o.id}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {o.id.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{o.customerId.slice(0, 8)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[o.status]}>{STATUS_LABELS[o.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(Number(o.totalAmount), o.currency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(o.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {['PENDING', 'VALIDATED', 'IN_PRODUCTION', 'READY'].includes(o.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm('Annuler cette commande ?')) {
                            cancelMutation.mutate(o.id)
                          }
                        }}
                      >
                        Annuler
                      </Button>
                    )}
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
