import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Factory,
  Loader2,
  Package,
  ShoppingCart,
  Truck,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ordersService } from '@/services'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { extractErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import type { OrderStatus } from '@/types/domain'

const STEPS: { status: OrderStatus; label: string; icon: typeof Circle }[] = [
  { status: 'PENDING', label: 'En attente', icon: Circle },
  { status: 'VALIDATED', label: 'Validée', icon: CheckCircle2 },
  { status: 'IN_PRODUCTION', label: 'En production', icon: Factory },
  { status: 'READY', label: 'Prête', icon: Package },
  { status: 'SHIPPED', label: 'Expédiée', icon: Truck },
  { status: 'DELIVERED', label: 'Livrée', icon: CheckCircle2 },
]

const NEXT_TRANSITIONS: Partial<Record<OrderStatus, { to: OrderStatus; label: string }[]>> = {
  VALIDATED: [{ to: 'READY', label: 'Marquer prête' }],
  IN_PRODUCTION: [{ to: 'READY', label: 'Marquer prête' }],
  READY: [{ to: 'SHIPPED', label: 'Expédier' }],
  SHIPPED: [{ to: 'DELIVERED', label: 'Livrer' }],
}

const CANCELLABLE: OrderStatus[] = ['PENDING', 'VALIDATED', 'IN_PRODUCTION', 'READY']

export default function OrderDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const role = useAuthStore((s) => s.user?.role)
  const userId = useAuthStore((s) => s.user?.id)
  const canManage = role === 'ADMIN' || role === 'OPERATOR'

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersService.get(id!),
    enabled: !!id,
    refetchInterval: 10_000,
  })

  const transitionMutation = useMutation({
    mutationFn: (nextStatus: OrderStatus) => ordersService.updateStatus(id!, nextStatus),
    onSuccess: (_, next) => {
      toast.success(`Commande → ${next}`)
      qc.invalidateQueries({ queryKey: ['order', id] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const cancelMutation = useMutation({
    mutationFn: () => ordersService.cancel(id!),
    onSuccess: () => {
      toast.success('Commande annulée — compensation Saga en cours')
      qc.invalidateQueries({ queryKey: ['order', id] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

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
  const nextActions = NEXT_TRANSITIONS[order.status] ?? []
  const canCancel = CANCELLABLE.includes(order.status)
  // Un CLIENT ne peut annuler que ses propres commandes (la policy backend le
  // vérifie aussi, mais on cache le bouton pour ne pas induire en erreur)
  const clientOwnsThis = role !== 'CLIENT' || order.customerId === userId

  const returnHref = role === 'CLIENT' ? '/my-orders' : '/orders'
  const returnLabel = role === 'CLIENT' ? 'Mes commandes' : 'Commandes'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to={returnHref}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            {returnLabel}
          </Link>
        </Button>
        <h2 className="text-lg font-semibold font-mono">{order.id}</h2>
        <Badge
          variant={
            isCancelled
              ? 'destructive'
              : order.status === 'DELIVERED'
                ? 'success'
                : 'secondary'
          }
        >
          {order.status}
        </Badge>

        {canManage && !isCancelled && (
          <div className="ml-auto flex flex-wrap gap-2">
            {nextActions.map((action) => (
              <Button
                key={action.to}
                size="sm"
                onClick={() => transitionMutation.mutate(action.to)}
                disabled={transitionMutation.isPending}
              >
                {transitionMutation.isPending && (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                )}
                {action.label}
              </Button>
            ))}
          </div>
        )}
        {!isCancelled && canCancel && clientOwnsThis && (
          <Button
            size="sm"
            variant="outline"
            className={canManage ? '' : 'ml-auto'}
            onClick={() => {
              if (confirm('Annuler cette commande et libérer le stock réservé ?')) {
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Timeline Saga
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
                    <TableCell className="font-mono text-xs">{l.productId}</TableCell>
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
            <div className="flex justify-between">
              <span className="text-muted-foreground">Client</span>
              <span className="font-mono text-xs">{order.customerId.slice(0, 8)}</span>
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
