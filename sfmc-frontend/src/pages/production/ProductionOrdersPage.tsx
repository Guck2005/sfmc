import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ClipboardCheck, Eye, Loader2, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { RowActionsMenu } from '@/components/RowActionsMenu'
import { useProductNameMap } from '@/hooks/use-product-name-map'
import { isKnownCatalogProductId } from '@/lib/catalog'
import { ordersService, productionService } from '@/services'
import { asArray } from '@/lib/pagination'
import { formatDateTime } from '@/lib/utils'
import { extractErrorMessage } from '@/lib/api'
import { DataTableEmpty } from '@/components/DataTableEmpty'
import { useAuthStore } from '@/stores/auth-store'
import type { Order, OrderStatus, ProductionOrder, ProductionStatus } from '@/types/domain'
import {
  ALL_PO_STATUS,
  PO_STATUS_LABELS,
  productionOrderSchema,
  qualitySchema,
  STATUS_COLORS,
  TERMINAL,
  type ProductionOrderFormIn,
  type ProductionOrderFormOut,
  type QualityFormIn,
  type QualityFormOut,
} from './production-shared'

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'En attente',
  VALIDATED: 'Validée',
  IN_PRODUCTION: 'En production',
  READY: 'Prête',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
}

/** Commandes encore éligibles pour un lien OF (pas livrées, pas annulées). */
function isOrderLinkableForProduction(status: OrderStatus) {
  return status !== 'DELIVERED' && status !== 'CANCELLED'
}

export default function ProductionOrdersPage() {
  const [open, setOpen] = useState(false)
  const [qualityOrder, setQualityOrder] = useState<ProductionOrder | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('__all__')

  const qc = useQueryClient()
  const canQA = useAuthStore((s) => s.hasRole('ADMIN', 'OPERATOR'))

  const listParams =
    statusFilter === '__all__' ? undefined : { status: statusFilter, limit: 100 as const }

  const { data, isLoading } = useQuery({
    queryKey: ['production-orders', listParams],
    queryFn: () => productionService.list(listParams),
    refetchInterval: 15_000,
  })

  const { products, productLabel, nameById } = useProductNameMap({ limit: 200 })

  const { data: ordersForLinkData } = useQuery({
    queryKey: ['orders-for-production-link'],
    queryFn: () => ordersService.list({ limit: 150 }),
    enabled: open,
  })

  const linkableOrders = asArray<Order>(ordersForLinkData).filter((o) =>
    isOrderLinkableForProduction(o.status)
  )

  const { data: detailOrder, isFetching: loadingDetail } = useQuery({
    queryKey: ['production-order', detailId],
    queryFn: () => productionService.get(detailId!),
    enabled: !!detailId,
  })

  const orders = asArray<ProductionOrder>(data)

  const form = useForm<ProductionOrderFormIn, unknown, ProductionOrderFormOut>({
    resolver: zodResolver(productionOrderSchema),
  })

  const createMutation = useMutation({
    mutationFn: (payload: ProductionOrderFormOut) =>
      productionService.create({
        productId: payload.productId,
        quantity: payload.quantity,
        ...(payload.orderId ? { orderId: payload.orderId } : {}),
      }),
    onSuccess: () => {
      toast.success('Ordre de production créé')
      qc.invalidateQueries({ queryKey: ['production-orders'] })
      setOpen(false)
      form.reset()
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const qualityForm = useForm<QualityFormIn, unknown, QualityFormOut>({
    resolver: zodResolver(qualitySchema),
    defaultValues: { passed: true },
  })

  const qaMutation = useMutation({
    mutationFn: (payload: { id: string; data: QualityFormOut }) =>
      productionService.qualityControl(payload.id, {
        passed: payload.data.passed,
        notes: payload.data.notes,
      }),
    onSuccess: () => {
      toast.success('Contrôle qualité enregistré')
      qc.invalidateQueries({ queryKey: ['production-orders'] })
      qc.invalidateQueries({ queryKey: ['production-order'] })
      setQualityOrder(null)
      qualityForm.reset({ passed: true })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const statusMutation = useMutation({
    mutationFn: (payload: { id: string; status: ProductionStatus }) =>
      productionService.updateStatus(payload.id, payload.status),
    onSuccess: () => {
      toast.success('Statut mis à jour')
      qc.invalidateQueries({ queryKey: ['production-orders'] })
      qc.invalidateQueries({ queryKey: ['production-order'] })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  return (
    <>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Ordres de production</CardTitle>
            <CardDescription>
              Suivez les ordres de fabrication ; à la création, la liaison à une commande est facultative (liste des
              commandes non livrées).
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrer statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tous les statuts</SelectItem>
                {ALL_PO_STATUS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {PO_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog
              open={open}
              onOpenChange={(v) => {
                setOpen(v)
                if (v) {
                  form.reset({ quantity: 1, productId: '', orderId: undefined })
                }
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-1 h-4 w-4" />
                  Nouveau
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nouvel ordre de production</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
                  className="space-y-4"
                >
                  <div className="space-y-1">
                    <Label>Produit</Label>
                    <Select
                      value={form.watch('productId')}
                      onValueChange={(v) => form.setValue('productId', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir…" />
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
                  <div className="space-y-1">
                    <Label>Quantité</Label>
                    <Input type="number" min={1} {...form.register('quantity')} />
                  </div>
                  <div className="space-y-1">
                    <Label>Commande liée (optionnel)</Label>
                    <Select
                      value={form.watch('orderId') ?? '__none__'}
                      onValueChange={(v) =>
                        form.setValue('orderId', v === '__none__' ? undefined : v, { shouldValidate: true })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Aucune commande" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Aucune commande</SelectItem>
                        {linkableOrders.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.orderNumber ?? `Commande ${o.id.slice(0, 8)}…`} — {ORDER_STATUS_LABELS[o.status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={createMutation.isPending}>
                      {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Créer
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Chargement…</div>
          ) : orders.length === 0 ? (
            <DataTableEmpty message="Aucun ordre de production" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Produit</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Démarré</TableHead>
                  <TableHead className="w-12 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => {
                  const isTerminal = TERMINAL.includes(o.status)
                  return (
                    <TableRow
                      key={o.id}
                      className="cursor-pointer"
                      title="Voir le détail de l’OF"
                      onClick={() => setDetailId(o.id)}
                    >
                      <TableCell className="font-mono text-xs">{o.id.slice(0, 8)}</TableCell>
                      <TableCell className="max-w-[14rem]">
                        <div className="font-medium text-sm">{productLabel(o.productId)}</div>
                        {!isKnownCatalogProductId(nameById, o.productId) && (
                          <div className="truncate font-mono text-[10px] text-muted-foreground" title={o.productId}>
                            {o.productId}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">{o.quantity}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_COLORS[o.status]}>{PO_STATUS_LABELS[o.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {o.startedAt ? formatDateTime(o.startedAt) : '—'}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end">
                          <RowActionsMenu ariaLabel={`Actions OF ${o.id.slice(0, 8)}`}>
                            <DropdownMenuItem onClick={() => setDetailId(o.id)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Voir détail
                            </DropdownMenuItem>
                            {canQA && (o.status === 'IN_PROGRESS' || o.status === 'QUALITY_CHECK') && (
                              <DropdownMenuItem onClick={() => setQualityOrder(o)}>
                                <ClipboardCheck className="mr-2 h-4 w-4" />
                                Contrôle qualité
                              </DropdownMenuItem>
                            )}
                            {canQA && !isTerminal && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger>Changer le statut</DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    {ALL_PO_STATUS.map((s) => (
                                      <DropdownMenuItem
                                        key={s}
                                        disabled={s === o.status || statusMutation.isPending}
                                        onClick={() => statusMutation.mutate({ id: o.id, status: s })}
                                      >
                                        {PO_STATUS_LABELS[s]}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                              </>
                            )}
                          </RowActionsMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detailId} onOpenChange={(v) => !v && setDetailId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Détail OF</DialogTitle>
          </DialogHeader>
          {loadingDetail || !detailOrder ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Id</span>{' '}
                <span className="font-mono text-xs">{detailOrder.id}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Commande</span>{' '}
                {detailOrder.orderId ? (
                  <span className="font-mono text-xs">{detailOrder.orderId}</span>
                ) : (
                  <span className="text-muted-foreground">Aucune</span>
                )}
              </p>
              <p>
                <span className="text-muted-foreground">Produit</span>{' '}
                <span className="font-medium">{productLabel(detailOrder.productId)}</span>
              </p>
              {!isKnownCatalogProductId(nameById, detailOrder.productId) && (
                <p className="font-mono text-[10px] text-muted-foreground break-all">{detailOrder.productId}</p>
              )}
              <p>
                <span className="text-muted-foreground">Quantité</span> {detailOrder.quantity}
              </p>
              <p>
                <span className="text-muted-foreground">Statut</span>{' '}
                <Badge variant={STATUS_COLORS[detailOrder.status]}>{PO_STATUS_LABELS[detailOrder.status]}</Badge>
              </p>
              {detailOrder.machineId && (
                <p>
                  <span className="text-muted-foreground">Machine</span>{' '}
                  <span className="font-mono text-xs">{detailOrder.machineId}</span>
                </p>
              )}
              <p>
                <span className="text-muted-foreground">Créé</span>{' '}
                {formatDateTime(detailOrder.createdAt)}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!qualityOrder} onOpenChange={(v) => !v && setQualityOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contrôle qualité</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={qualityForm.handleSubmit((v) =>
              qualityOrder && qaMutation.mutate({ id: qualityOrder.id, data: v })
            )}
            className="space-y-4"
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="passed"
                {...qualityForm.register('passed')}
                className="h-4 w-4"
              />
              <Label htmlFor="passed" className="cursor-pointer">
                Lot validé
              </Label>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Input {...qualityForm.register('notes')} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={qaMutation.isPending}>
                {qaMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Valider
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
