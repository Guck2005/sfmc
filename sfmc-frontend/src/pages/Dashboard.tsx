import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import {
  AlertTriangle,
  CircleCheckBig,
  DollarSign,
  Factory,
  PackageCheck,
  ShoppingCart,
  Radio,
  Boxes,
  FileText,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { reportingService } from '@/services'
import { formatCurrency } from '@/lib/utils'
import { getWsClient } from '@/lib/graphql'

interface KpiCardProps {
  title: string
  value: string
  icon: typeof DollarSign
  hint?: string
  tone?: 'default' | 'warning' | 'success'
}

function KpiCard({ title, value, icon: Icon, hint, tone = 'default' }: KpiCardProps) {
  const toneCls =
    tone === 'warning'
      ? 'bg-amber-100 text-amber-700'
      : tone === 'success'
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-sfmc-100 text-sfmc-700'
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {title}
            </div>
            <div className="mt-2 text-2xl font-bold">{value}</div>
            {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
          </div>
          <div className={`rounded-lg p-2.5 ${toneCls}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/** Subscription alignée sur reporting-service/app/graphql/schema.ts */
const KPI_SUBSCRIPTION = /* GraphQL */ `
  subscription OnKpiUpdate {
    kpiUpdated {
      totalOrders
      totalRevenue
      qualityFailureRate
      criticalStockCount
    }
  }
`

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  VALIDATED: 'Validée',
  IN_PRODUCTION: 'En production',
  READY: 'Prête',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
}

export default function DashboardPage() {
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'live' | 'offline'>('connecting')

  const { data: kpis, isLoading, refetch, error } = useQuery({
    queryKey: ['reports', 'dashboard'],
    queryFn: () => reportingService.dashboard(),
    refetchInterval: 30_000,
  })

  useEffect(() => {
    const client = getWsClient()
    const unsubscribe = client.subscribe(
      { query: KPI_SUBSCRIPTION },
      {
        next: () => {
          setLiveStatus('live')
          refetch()
        },
        error: () => setLiveStatus('offline'),
        complete: () => setLiveStatus('offline'),
      }
    )
    const t = setTimeout(() => setLiveStatus((s) => (s === 'connecting' ? 'offline' : s)), 4000)
    return () => {
      clearTimeout(t)
      unsubscribe()
    }
  }, [refetch])

  const ordersByStatus =
    kpis?.ordersByStatus?.map((row) => ({
      label: STATUS_LABELS[row.status] ?? row.status,
      count: row.count,
    })) ?? []

  const pendingProduction =
    (kpis?.totalOrders ?? 0) - (kpis?.productionCompleted ?? 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Vue synthétique — données agrégées par le reporting-service, rafraîchies via
            GraphQL Subscriptions.
          </p>
        </div>
        <Badge
          variant={liveStatus === 'live' ? 'success' : liveStatus === 'offline' ? 'outline' : 'secondary'}
          className="gap-1.5"
        >
          <Radio className={`h-3 w-3 ${liveStatus === 'live' ? 'animate-pulse' : ''}`} />
          {liveStatus === 'live'
            ? 'Flux temps réel'
            : liveStatus === 'offline'
              ? 'Offline (polling 30s)'
              : 'Connexion…'}
        </Badge>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">
            Impossible de charger les KPIs du reporting-service. Vérifiez que le service est
            démarré sur le port 3009.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Commandes"
          value={isLoading ? '…' : String(kpis?.totalOrders ?? 0)}
          icon={ShoppingCart}
          hint="Total toutes périodes"
        />
        <KpiCard
          title="Chiffre d'affaires"
          value={isLoading ? '…' : formatCurrency(kpis?.totalRevenue ?? 0)}
          icon={DollarSign}
          tone="success"
          hint="Commandes validées / expédiées / livrées"
        />
        <KpiCard
          title="Production terminée"
          value={isLoading ? '…' : String(kpis?.productionCompleted ?? 0)}
          icon={Factory}
          hint={`${Math.max(pendingProduction, 0)} en cours ou à planifier`}
        />
        <KpiCard
          title="Taux d'échec qualité"
          value={isLoading ? '…' : `${(kpis?.qualityFailureRate ?? 0).toFixed(2)} %`}
          icon={AlertTriangle}
          tone={(kpis?.qualityFailureRate ?? 0) > 5 ? 'warning' : 'success'}
          hint={`${kpis?.productionQualityFailed ?? 0} lot(s) rejeté(s)`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Commandes par statut</CardTitle>
            <CardDescription>Répartition live dans la saga</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {ordersByStatus.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Aucune commande pour le moment.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ordersByStatus}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="label"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis
                    allowDecimals={false}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Facturation</CardTitle>
            <CardDescription>État des factures émises</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-emerald-600" />
                <span>Payées</span>
              </div>
              <Badge variant="success">{kpis?.paidInvoices ?? 0}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-amber-600" />
                <span>En attente</span>
              </div>
              <Badge variant="warning">{kpis?.pendingInvoices ?? 0}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Boxes className="h-4 w-4 text-red-600" />
                <span>Stocks critiques</span>
              </div>
              <Badge
                variant={
                  (kpis?.criticalStockCount ?? 0) > 0 ? 'destructive' : 'outline'
                }
              >
                {kpis?.criticalStockCount ?? 0}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PackageCheck className="h-4 w-4" />
              Qualité contrôle
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {(kpis?.qualityFailureRate ?? 0) <= 5
                ? 'Les lots respectent les seuils tolérés.'
                : "Taux d'échec au-dessus de 5 % — investigation recommandée."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CircleCheckBig className="h-4 w-4" />
              Saga commandes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Orchestration RabbitMQ opérationnelle entre order, inventory, billing et
              production.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Radio className="h-4 w-4" />
              Événements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Ce tableau se met à jour dès qu'une commande, facture ou ordre de production
              change d'état.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
