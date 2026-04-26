import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Factory,
  Loader2,
  Package,
  Plus,
  ShoppingCart,
  Truck,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ordersService, inventoryService } from '@/services'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { extractErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import type { Order, OrderLine, OrderShipmentAllocation, OrderStatus, Warehouse } from '@/types/domain'

type ShipAllocRow = { warehouseId: string; quantity: number }

function validateSplitShip(lines: OrderLine[], splitRows: ShipAllocRow[][]): string | null {
  if (splitRows.length !== lines.length) return 'Configuration incomplète'
  for (let i = 0; i < lines.length; i++) {
    const need = Number(lines[i].quantity)
    const rows = splitRows[i]
    if (!rows?.length) return 'Au moins une ligne d’origine par produit commandé'
    let sum = 0
    for (const r of rows) {
      if (r.quantity < 0) return 'Quantité invalide'
      if (Number(r.quantity) > 0 && !r.warehouseId) return 'Chaque fraction doit avoir un entrepôt'
      sum += Number(r.quantity)
    }
    if (Math.abs(sum - need) > 1e-6) {
      return `« ${lines[i].productName?.trim() || lines[i].productId.slice(0, 8)} » : total ${sum} ≠ commandé ${need}`
    }
  }
  return null
}

function buildShipmentAllocations(lines: OrderLine[], splitRows: ShipAllocRow[][]): OrderShipmentAllocation[] {
  const out: OrderShipmentAllocation[] = []
  for (let i = 0; i < lines.length; i++) {
    const pid = lines[i].productId
    for (const r of splitRows[i] ?? []) {
      const q = Number(r.quantity)
      if (q > 0 && r.warehouseId) {
        out.push({ productId: pid, quantity: q, warehouseId: r.warehouseId })
      }
    }
  }
  return out
}

const STEPS: { status: OrderStatus; label: string; icon: typeof Circle }[] = [
  { status: 'PENDING', label: 'En attente', icon: Circle },
  { status: 'VALIDATED', label: 'Validée', icon: CheckCircle2 },
  { status: 'IN_PRODUCTION', label: 'En production', icon: Factory },
  { status: 'READY', label: 'Prête', icon: Package },
  { status: 'SHIPPED', label: 'Expédiée', icon: Truck },
  { status: 'DELIVERED', label: 'Livrée', icon: CheckCircle2 },
]

const CANCELLABLE: OrderStatus[] = ['PENDING', 'VALIDATED', 'IN_PRODUCTION', 'READY']

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'En attente',
  VALIDATED: 'Validée',
  IN_PRODUCTION: 'En production',
  READY: 'Prête',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
}

/** Même ordre que `WORKFLOW_STATUSES` côté order-service — tous sélectionnables (y compris retour arrière). */
const ALL_MANAGEABLE_ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'VALIDATED',
  'IN_PRODUCTION',
  'READY',
  'SHIPPED',
  'DELIVERED',
]

export default function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const role = useAuthStore((s) => s.user?.role)
  const userId = useAuthStore((s) => s.user?.id)
  const canManage = role === 'ADMIN' || role === 'OPERATOR'
  const isAdmin = role === 'ADMIN'
  const [selectedNext, setSelectedNext] = useState<OrderStatus | ''>('')
  const [shipmentWarehouseId, setShipmentWarehouseId] = useState('')
  const [shipMultiSplit, setShipMultiSplit] = useState(false)
  const [splitRowsByLine, setSplitRowsByLine] = useState<ShipAllocRow[][]>([])
  const [shipDialogOpen, setShipDialogOpen] = useState(false)

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersService.get(id!),
    enabled: !!id,
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  })

  const { data: warehousesRaw } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => inventoryService.listWarehouses(),
    enabled: canManage,
  })
  const warehouses: Warehouse[] = Array.isArray(warehousesRaw)
    ? (warehousesRaw as Warehouse[])
    : ((warehousesRaw as { data?: Warehouse[] })?.data ?? [])

  const transitionMutation = useMutation({
    mutationFn: (input: {
      status: OrderStatus
      warehouseId?: string
      allocations?: OrderShipmentAllocation[]
    }) =>
      ordersService.updateStatus(id!, input.status, {
        warehouseId: input.warehouseId,
        allocations: input.allocations,
      }),
    onSuccess: (updated, variables) => {
      const nextStatus = variables.status
      setSelectedNext('')
      setShipmentWarehouseId('')
      setShipMultiSplit(false)
      setSplitRowsByLine([])
      setShipDialogOpen(false)
      qc.setQueryData<Order | undefined>(['order', id], (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          status: updated.status,
          updatedAt: updated.updatedAt,
        }
      })
      const label = STEPS.find((s) => s.status === nextStatus)?.label ?? nextStatus
      toast.success(`Statut mis à jour : ${label}`)
      void qc.invalidateQueries({ queryKey: ['order', id] })
      void qc.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err) => {
      setShipmentWarehouseId('')
      setShipMultiSplit(false)
      setSplitRowsByLine([])
      toast.error(extractErrorMessage(err))
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => ordersService.cancel(id!),
    onSuccess: (updated) => {
      setSelectedNext('')
      qc.setQueryData<Order | undefined>(['order', id], (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          status: updated.status,
          updatedAt: updated.updatedAt,
        }
      })
      toast.success('Commande annulée — traitements associés en cours')
      void qc.invalidateQueries({ queryKey: ['order', id] })
      void qc.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const returnHrefEarly = role === 'CLIENT' ? '/my-orders' : '/orders'

  const deleteMutation = useMutation({
    mutationFn: () => ordersService.remove(id!),
    onSuccess: () => {
      toast.success('Commande supprimée')
      void qc.invalidateQueries({ queryKey: ['orders'] })
      navigate(returnHrefEarly)
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  useEffect(() => {
    setSelectedNext('')
    setShipmentWarehouseId('')
    setShipMultiSplit(false)
    setSplitRowsByLine([])
    setShipDialogOpen(false)
  }, [order?.status, order?.id])

  useEffect(() => {
    if (selectedNext !== 'SHIPPED') {
      setShipmentWarehouseId('')
      setShipMultiSplit(false)
      setSplitRowsByLine([])
      setShipDialogOpen(false)
    }
  }, [selectedNext])

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">Chargement…</div>
  }

  if (!order) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <p className="text-muted-foreground">Commande introuvable.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to={role === 'CLIENT' ? '/my-orders' : '/orders'}>Retour</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const currentIndex = STEPS.findIndex((s) => s.status === order.status)
  const isCancelled = order.status === 'CANCELLED'
  /** Saga nominal : `DELIVERED` est terminal (plus de PUT status). */
  const isDeliveredTerminal = order.status === 'DELIVERED'
  const canChangeStatus = canManage && !isCancelled && !isDeliveredTerminal

  const canCancel = CANCELLABLE.includes(order.status)
  // Un CLIENT ne peut annuler que ses propres commandes (la policy backend le
  // vérifie aussi, mais on cache le bouton pour ne pas induire en erreur)
  const clientOwnsThis = role !== 'CLIENT' || order.customerId === userId

  const returnHref = returnHrefEarly
  const returnLabel = role === 'CLIENT' ? 'Mes commandes' : 'Commandes'

  const selectValue =
    selectedNext !== '' && ALL_MANAGEABLE_ORDER_STATUSES.includes(selectedNext as OrderStatus)
      ? selectedNext
      : undefined

  const splitShipError =
    shipDialogOpen &&
    shipMultiSplit &&
    order.lines.length > 0 &&
    splitRowsByLine.length === order.lines.length
      ? validateSplitShip(order.lines, splitRowsByLine)
      : null

  const closeShipDialog = () => {
    setShipDialogOpen(false)
    setShipmentWarehouseId('')
    setShipMultiSplit(false)
    setSplitRowsByLine([])
    if (selectedNext === 'SHIPPED') setSelectedNext('')
  }

  const openShipDialog = () => {
    setShipmentWarehouseId('')
    setShipMultiSplit(false)
    setSplitRowsByLine([])
    setShipDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to={returnHref}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            {returnLabel}
          </Link>
        </Button>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{order.orderNumber ?? order.id}</h2>
          {!order.orderNumber ? (
            <p className="truncate font-mono text-xs text-muted-foreground" title={order.id}>
              {order.id}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Badge
            variant={
              isCancelled
                ? 'destructive'
                : order.status === 'DELIVERED'
                  ? 'success'
                  : 'secondary'
            }
          >
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </Badge>
          {order.paymentStatus === 'AWAITING_MOBILE_MONEY' && (
            <Badge variant="outline" className="text-xs">
              Paiement mobile money en attente
            </Badge>
          )}
        </div>

        {canChangeStatus && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select
              value={selectValue}
              onValueChange={(v) => setSelectedNext(v as OrderStatus)}
            >
              <SelectTrigger className="w-[min(100vw-2rem,280px)] h-9">
                <SelectValue placeholder="Choisir le statut cible…" />
              </SelectTrigger>
              <SelectContent>
                {ALL_MANAGEABLE_ORDER_STATUSES.map((to) => (
                  <SelectItem key={to} value={to}>
                    {STEPS.find((s) => s.status === to)?.label ?? to}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!selectedNext || selectedNext === order.status || transitionMutation.isPending}
              onClick={() => {
                if (!selectedNext) return
                if (selectedNext === 'SHIPPED') {
                  openShipDialog()
                  return
                }
                transitionMutation.mutate({ status: selectedNext })
              }}
            >
              {transitionMutation.isPending && (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              )}
              Appliquer
            </Button>
          </div>
        )}
        {!isCancelled && canCancel && clientOwnsThis && (
          <Button
            size="sm"
            variant="outline"
            className={canManage ? '' : 'ml-auto'}
            onClick={() => {
              if (confirm('Annuler cette commande ? Les compensations système seront appliquées.')) {
                cancelMutation.mutate()
              }
            }}
            disabled={cancelMutation.isPending}
          >
            {cancelMutation.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <XCircle className="mr-1 h-3.5 w-3.5" />
            )}
            Annuler
          </Button>
        )}
        {isAdmin && !isCancelled && canCancel && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (
                confirm(
                  'Supprimer définitivement cette commande ? Action réservée aux administrateurs ; stocks et facturation seront ajustés.'
                )
              ) {
                deleteMutation.mutate()
              }
            }}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Supprimer définitivement
          </Button>
        )}
        {canManage && isDeliveredTerminal && (
          <p className="ml-auto text-xs text-muted-foreground max-w-sm text-right">
            Commande livrée : le statut ne peut plus être modifié depuis cette page.
          </p>
        )}
      </div>

      <Dialog open={shipDialogOpen} onOpenChange={(open) => !open && closeShipDialog()}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmer l’expédition</DialogTitle>
            <DialogDescription>
              Commande {order.orderNumber ?? order.id.slice(0, 8)} — les sorties de stock seront enregistrées
              immédiatement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-input"
                checked={shipMultiSplit}
                onChange={(e) => {
                  const v = e.target.checked
                  setShipMultiSplit(v)
                  if (v) {
                    setSplitRowsByLine(
                      order.lines.map((l) => [{ warehouseId: '', quantity: Number(l.quantity) }])
                    )
                    setShipmentWarehouseId('')
                  } else {
                    setSplitRowsByLine([])
                  }
                }}
              />
              Répartir sur plusieurs entrepôts
            </label>
            {!shipMultiSplit && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Toute la commande part du même entrepôt.</p>
                <Select value={shipmentWarehouseId || undefined} onValueChange={setShipmentWarehouseId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir l’entrepôt d’expédition…" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {shipMultiSplit && (
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  Pour chaque ligne, la somme des quantités doit égaler la quantité commandée.
                </p>
                {order.lines.map((line, lineIdx) => (
                  <div key={line.id ?? `${line.productId}-${lineIdx}`} className="space-y-2">
                    <div className="text-xs font-medium">
                      {(line.productName && line.productName.trim()) || 'Produit'}{' '}
                      <span className="font-mono text-muted-foreground">× {line.quantity}</span>
                    </div>
                    {(splitRowsByLine[lineIdx] ?? []).map((row, rowIdx) => (
                      <div key={rowIdx} className="flex flex-wrap items-center gap-2">
                        <Select
                          value={row.warehouseId || undefined}
                          onValueChange={(wid) => {
                            setSplitRowsByLine((prev) => {
                              const copy = prev.map((arr) => arr.map((x) => ({ ...x })))
                              if (!copy[lineIdx]) copy[lineIdx] = []
                              copy[lineIdx][rowIdx] = { ...copy[lineIdx][rowIdx], warehouseId: wid }
                              return copy
                            })
                          }}
                        >
                          <SelectTrigger className="w-[min(100%,220px)] h-8">
                            <SelectValue placeholder="Entrepôt" />
                          </SelectTrigger>
                          <SelectContent>
                            {warehouses.map((w) => (
                              <SelectItem key={w.id} value={w.id}>
                                {w.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          className="h-8 w-24 font-mono text-sm"
                          aria-label={`Quantité origine ${rowIdx + 1}`}
                          value={row.quantity === 0 ? '' : String(row.quantity)}
                          onChange={(e) => {
                            const raw = e.target.value
                            const num = raw === '' ? 0 : Number(raw)
                            setSplitRowsByLine((prev) => {
                              const copy = prev.map((arr) => arr.map((x) => ({ ...x })))
                              if (!copy[lineIdx]) copy[lineIdx] = []
                              copy[lineIdx][rowIdx] = {
                                ...copy[lineIdx][rowIdx],
                                quantity: Number.isFinite(num) ? num : 0,
                              }
                              return copy
                            })
                          }}
                        />
                        {(splitRowsByLine[lineIdx]?.length ?? 0) > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-destructive"
                            onClick={() => {
                              setSplitRowsByLine((prev) => {
                                const copy = prev.map((arr) => [...arr])
                                copy[lineIdx] = copy[lineIdx].filter((_, j) => j !== rowIdx)
                                return copy
                              })
                            }}
                          >
                            Retirer
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setSplitRowsByLine((prev) => {
                          const copy = prev.map((arr) => [...arr])
                          if (!copy[lineIdx]) copy[lineIdx] = []
                          copy[lineIdx] = [...copy[lineIdx], { warehouseId: '', quantity: 0 }]
                          return copy
                        })
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Autre origine
                    </Button>
                  </div>
                ))}
                {splitShipError ? <p className="text-xs text-destructive">{splitShipError}</p> : null}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={closeShipDialog}>
              Annuler
            </Button>
            <Button
              type="button"
              disabled={
                transitionMutation.isPending ||
                (!shipMultiSplit && !shipmentWarehouseId) ||
                (shipMultiSplit &&
                  (!!splitShipError ||
                    splitRowsByLine.length !== order.lines.length ||
                    splitRowsByLine.length === 0))
              }
              onClick={() => {
                if (shipMultiSplit) {
                  const err = validateSplitShip(order.lines, splitRowsByLine)
                  if (err) {
                    toast.error(err)
                    return
                  }
                  const allocations = buildShipmentAllocations(order.lines, splitRowsByLine)
                  if (!allocations.length) {
                    toast.error('Aucune quantité à expédier')
                    return
                  }
                  transitionMutation.mutate({ status: 'SHIPPED', allocations })
                  return
                }
                if (!shipmentWarehouseId) {
                  toast.error('Choisissez l’entrepôt d’expédition')
                  return
                }
                transitionMutation.mutate({ status: 'SHIPPED', warehouseId: shipmentWarehouseId })
              }}
            >
              {transitionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmer l’expédition
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canChangeStatus && (
        <Card className="border-muted bg-muted/20">
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-foreground">À propos des statuts</CardTitle>
            <CardDescription className="text-xs leading-relaxed space-y-2 block">
              <span className="block">
                <strong>Validée</strong> : en principe <strong>automatique</strong> dès que la disponibilité
                globale est confirmée pour la commande. Le menu permet aussi de corriger manuellement les états
                (y compris revenir en arrière), sauf une fois la commande <strong>livrée</strong>.
              </span>
              <span className="block pt-1">
                <strong>Expédiée</strong> : après avoir choisi ce statut et cliqué <strong>Appliquer</strong>, une
                fenêtre vous demande l’entrepôt (ou une répartition multi-entrepôts) avant de déduire le stock.{' '}
                <strong>Livrée</strong> : <strong>réception confirmée</strong> — état final sans changement de
                statut par ce menu. Pour une annulation, utilisez le bouton dédié.
              </span>
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Étapes de la commande
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isCancelled ? (
            <div className="text-sm text-destructive">
              Commande annulée — les compensations (libération stock, invalidation facture) ont
              été émises.
            </div>
          ) : (
            <ol className="flex items-center w-full">
              {STEPS.map((step, idx) => {
                const done = idx <= currentIndex
                const current = idx === currentIndex
                const Icon = step.icon
                return (
                  <li
                    key={step.status}
                    className={`flex items-center ${
                      idx < STEPS.length - 1 ? 'w-full' : ''
                    } ${
                      idx < STEPS.length - 1
                        ? done
                          ? "after:content-[''] after:w-full after:h-1 after:border-b-2 after:border-sfmc-500 after:inline-block"
                          : "after:content-[''] after:w-full after:h-1 after:border-b-2 after:border-muted after:inline-block"
                        : ''
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${
                          current
                            ? 'bg-sfmc-600 text-white ring-4 ring-sfmc-200 animate-pulse'
                            : done
                              ? 'bg-sfmc-500 text-white'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <span
                        className={`mt-2 text-[11px] whitespace-nowrap ${
                          current ? 'font-semibold text-sfmc-700' : 'text-muted-foreground'
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Lignes de commande</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produit</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead className="text-right">PU</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines?.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="font-medium text-sm">
                        {(l.productName && l.productName.trim()) || 'Libellé non enregistré'}
                      </div>
                      {!(l.productName && l.productName.trim()) && (
                        <div className="text-xs text-muted-foreground font-mono">{l.productId}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">{l.quantity}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(Number(l.unitPrice), order.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatCurrency(Number(l.unitPrice) * Number(l.quantity), order.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Récapitulatif</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground shrink-0">Client</span>
              <span className="text-right text-sm font-medium">
                {order.customerDisplayName ?? order.customerId.slice(0, 8)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Créée</span>
              <span>{formatDateTime(order.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mise à jour</span>
              <span>{formatDateTime(order.updatedAt)}</span>
            </div>
            <div className="border-t pt-3 flex justify-between text-base">
              <span className="font-semibold">Total</span>
              <span className="font-bold">
                {formatCurrency(Number(order.totalAmount), order.currency)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
