import { useEffect, useState } from 'react'
import { useProductNameMap } from '@/hooks/use-product-name-map'
import { isKnownCatalogProductId } from '@/lib/catalog'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { toast } from 'sonner'
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
  BarChart3,
  CircleCheckBig,
  DollarSign,
  Factory,
  PackageCheck,
  ShoppingCart,
  Radio,
  Boxes,
  FileText,
  CalendarRange,
  Download,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { reportingCsvUrl, reportingService } from '@/services'
import { formatCurrency } from '@/lib/utils'
import { getWsClient } from '@/lib/graphql'
import { useAuthStore } from '@/stores/auth-store'
import { extractErrorMessage } from '@/lib/api'
import type { ReportExportType } from '@/types/domain'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LottieAnimation } from '@/components/ui/LottieAnimation'
import successAnim from '@/assets/animations/success.json'

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

const PRODUCTION_STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Planifié',
  IN_PROGRESS: 'En cours',
  QUALITY_CHECK: 'Contrôle qualité',
  COMPLETED: 'Terminé',
  FAILED: 'Rejeté',
  QUALITY_FAILED: 'Échec qualité',
  REJECTED: 'Rejeté',
}

const REPORT_EXPORT_LABELS: Record<ReportExportType, string> = {
  sales: 'Ventes',
  production: 'Production',
  quality: 'Qualité',
  stock: 'Stocks',
  orders: 'Commandes',
  invoices: 'Factures',
}

function periodHint(from: string, to: string) {
  if (!from && !to) return 'Toutes périodes (dates de commande)'
  if (from && to) return `Du ${from} au ${to}`
  if (from) return `Depuis le ${from}`
  return `Jusqu'au ${to}`
}

export type DashboardPageMode = 'dashboard' | 'reports'

type DashboardPageProps = {
  /** `dashboard` = synthèse `/` ; `reports` = analyses + exports sur `/reports` */
  pageMode?: DashboardPageMode
}

const STOCK_PAGE_SIZE = 10
const QUALITY_PAGE_SIZE = 8

export default function DashboardPage({ pageMode = 'dashboard' }: DashboardPageProps) {
  const role = useAuthStore((s) => s.user?.role)
  const isClient = role === 'CLIENT'

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo] = useState('')
  const [stockTablePage, setStockTablePage] = useState(0)
  const [qualityTablePage, setQualityTablePage] = useState(0)
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'live' | 'offline'>('connecting')
  const [wsDegraded, setWsDegraded] = useState(false)
  const [showFilterSuccess, setShowFilterSuccess] = useState(false)

  const rangeParams =
    from || to
      ? {
          from: from || undefined,
          to: to || undefined,
        }
      : undefined

  const { data: kpis, isLoading, refetch, error, isFetching } = useQuery({
    queryKey: ['reports', 'dashboard', from, to, role],
    queryFn: () => reportingService.dashboard(rangeParams),
    refetchInterval: 30_000,
  })

  const reportsEnabled = !isClient && pageMode === 'reports'

  const { productLabel, nameById } = useProductNameMap({
    enabled: reportsEnabled,
    limit: 200,
  })

  const { data: salesPeriod } = useQuery({
    queryKey: ['reports', 'sales', from, to],
    queryFn: () => reportingService.sales(rangeParams),
    enabled: reportsEnabled && !!rangeParams,
  })

  const { data: productionPeriod } = useQuery({
    queryKey: ['reports', 'production', from, to],
    queryFn: () => reportingService.production(rangeParams),
    enabled: reportsEnabled && !!rangeParams,
  })

  /** Ventes / production « toutes périodes » lorsque aucun filtre date n'est actif */
  const { data: salesAll } = useQuery({
    queryKey: ['reports', 'sales', 'all'],
    queryFn: () => reportingService.sales(),
    enabled: reportsEnabled && !rangeParams,
  })

  const { data: productionAll } = useQuery({
    queryKey: ['reports', 'production', 'all'],
    queryFn: () => reportingService.production(),
    enabled: reportsEnabled && !rangeParams,
  })

  const salesChart = rangeParams ? salesPeriod : salesAll
  const productionChart = rangeParams ? productionPeriod : productionAll

  const { data: qualityPeriod } = useQuery({
    queryKey: ['reports', 'quality', from, to],
    queryFn: () => reportingService.quality(rangeParams),
    enabled: reportsEnabled && !!rangeParams,
  })

  const { data: qualityAll } = useQuery({
    queryKey: ['reports', 'quality', 'all'],
    queryFn: () => reportingService.quality(),
    enabled: reportsEnabled && !rangeParams,
  })

  const qualityReport = rangeParams ? qualityPeriod : qualityAll

  const { data: stockPeriod } = useQuery({
    queryKey: ['reports', 'stock', from, to],
    queryFn: () => reportingService.stock(rangeParams),
    enabled: reportsEnabled && !!rangeParams,
  })

  const { data: stockAll } = useQuery({
    queryKey: ['reports', 'stock', 'all'],
    queryFn: () => reportingService.stock(),
    enabled: reportsEnabled && !rangeParams,
  })

  const stockReport = rangeParams ? stockPeriod : stockAll

  const downloadReportingCsv = async (type: ReportExportType) => {
    const token = useAuthStore.getState().token
    const url = reportingCsvUrl(type, rangeParams)
    try {
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${type}_report.csv`
      a.click()
      URL.revokeObjectURL(a.href)
      toast.success('Export téléchargé')
    } catch (e) {
      toast.error(extractErrorMessage(e))
    }
  }

  useEffect(() => {
    if (isClient) {
      setLiveStatus('offline')
      return
    }
    const client = getWsClient()
    const unsubscribe = client.subscribe(
      { query: KPI_SUBSCRIPTION },
      {
        next: () => {
          setLiveStatus('live')
          setWsDegraded(false)
          refetch()
        },
        error: () => {
          setLiveStatus('offline')
          setWsDegraded(true)
        },
        complete: () => {
          setLiveStatus('offline')
          setWsDegraded(true)
        },
      }
    )
    const t = setTimeout(() => setLiveStatus((s) => (s === 'connecting' ? 'offline' : s)), 4000)
    return () => {
      clearTimeout(t)
      unsubscribe()
    }
  }, [isClient, refetch])

  const ordersByStatus =
    kpis?.ordersByStatus?.map((row) => ({
      label: STATUS_LABELS[row.status] ?? row.status,
      count: row.count,
    })) ?? []

  const salesByStatus =
    salesChart?.ordersByStatus?.map((row) => ({
      label: STATUS_LABELS[row.status] ?? row.status,
      count: row.count,
    })) ?? []

  const productionByStatus =
    productionChart?.byStatus?.map((row) => ({
      label: PRODUCTION_STATUS_LABELS[row.status] ?? row.status,
      count: row.count,
    })) ?? []

  const pendingProduction =
    (kpis?.totalOrders ?? 0) - (kpis?.productionCompleted ?? 0)

  const periodLabel = periodHint(from, to)
  const is503 = isAxiosError(error) && error.response?.status === 503

  const applyFilters = () => {
    setFrom(draftFrom)
    setTo(draftTo)
    setShowFilterSuccess(true)
    window.setTimeout(() => setShowFilterSuccess(false), 2600)
  }

  const resetFilters = () => {
    setDraftFrom('')
    setDraftTo('')
    setFrom('')
    setTo('')
    setShowFilterSuccess(true)
    window.setTimeout(() => setShowFilterSuccess(false), 2600)
  }

  useEffect(() => {
    setStockTablePage(0)
    setQualityTablePage(0)
  }, [from, to])

  const stockSnapshots = stockReport?.latestSnapshots ?? []
  const stockPageCount = Math.max(1, Math.ceil(stockSnapshots.length / STOCK_PAGE_SIZE))
  const stockPageClamped = Math.min(stockTablePage, stockPageCount - 1)
  const stockRows = stockSnapshots.slice(
    stockPageClamped * STOCK_PAGE_SIZE,
    stockPageClamped * STOCK_PAGE_SIZE + STOCK_PAGE_SIZE
  )

  const qualityRejected = qualityReport?.topRejectedProducts ?? []
  const qualityPageCount = Math.max(1, Math.ceil(qualityRejected.length / QUALITY_PAGE_SIZE))
  const qualityPageClamped = Math.min(qualityTablePage, qualityPageCount - 1)
  const qualityRows = qualityRejected.slice(
    qualityPageClamped * QUALITY_PAGE_SIZE,
    qualityPageClamped * QUALITY_PAGE_SIZE + QUALITY_PAGE_SIZE
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {pageMode === 'reports' && !isClient
              ? 'Analyses ventes, production, qualité et stocks — exports tableur (même plage de dates que les filtres ci-dessous).'
              : isClient
                ? 'Vue personnelle : commandes et factures associées à votre compte (période filtrable).'
                : 'Vue synthétique : indicateurs agrégés ; graphiques détaillés et exports sur la page Rapports.'}
          </p>
          {pageMode === 'reports' && !isClient && (
            <Link
              to="/"
              className="inline-block text-sm font-medium text-sfmc-700 underline-offset-4 hover:underline"
            >
              ← Tableau de bord
            </Link>
          )}
          {wsDegraded && !isClient && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Le flux temps réel est indisponible (réseau ou service occupé). Les données restent
              synchronisées par actualisation automatique toutes les 30 secondes.
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <Badge
            variant={liveStatus === 'live' ? 'success' : liveStatus === 'offline' ? 'outline' : 'secondary'}
            className="gap-1.5"
          >
            <Radio className={`h-3 w-3 ${liveStatus === 'live' ? 'animate-pulse' : ''}`} />
            {isClient
              ? 'Actualisation 30 s'
              : liveStatus === 'live'
                ? 'Flux temps réel'
                : liveStatus === 'offline'
                  ? 'Hors ligne (actualisation 30 s)'
                  : 'Connexion…'}
          </Badge>
          {showFilterSuccess && (
            <div className="flex items-center gap-2 text-xs text-emerald-700">
              <LottieAnimation src={successAnim} size={36} loop={false} />
              <span>Période appliquée</span>
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarRange className="h-4 w-4" />
            Période d'analyse
          </CardTitle>
          <CardDescription>
            Filtre les indicateurs sur les dates de création des commandes (et cohérentes côté
            factures / production pour les vues internes).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="dash-from">Début</Label>
            <Input
              id="dash-from"
              type="date"
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="w-[11rem]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dash-to">Fin</Label>
            <Input
              id="dash-to"
              type="date"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
              className="w-[11rem]"
            />
          </div>
          <Button type="button" onClick={applyFilters} disabled={isFetching}>
            Appliquer
          </Button>
          <Button type="button" variant="outline" onClick={resetFilters} disabled={isFetching}>
            Toutes périodes
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">
            {is503
              ? 'Service reporting temporairement indisponible (surcharge ou maintenance). Réessayez dans quelques instants.'
              : 'Impossible de charger les indicateurs. Vérifiez que le service de reporting est démarré et accessible.'}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Commandes"
          value={isLoading ? '…' : String(kpis?.totalOrders ?? 0)}
          icon={ShoppingCart}
          hint={periodLabel}
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
          hint={
            isClient
              ? 'Réservé aux équipes internes SFMC'
              : `${Math.max(pendingProduction, 0)} en cours ou à planifier`
          }
        />
        <KpiCard
          title="Taux d'échec qualité"
          value={isLoading ? '…' : `${(kpis?.qualityFailureRate ?? 0).toFixed(2)} %`}
          icon={AlertTriangle}
          tone={(kpis?.qualityFailureRate ?? 0) > 5 ? 'warning' : 'success'}
          hint={
            isClient
              ? 'Non applicable à votre espace'
              : `${kpis?.productionQualityFailed ?? 0} lot(s) rejeté(s)`
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Commandes par statut</CardTitle>
            <CardDescription>{periodLabel}</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {ordersByStatus.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Aucune commande sur cette période.
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
            <CardDescription>État des factures (période sélectionnée)</CardDescription>
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
            {!isClient && (
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
            )}
          </CardContent>
        </Card>
      </div>

      {pageMode === 'dashboard' && !isClient && (
        <Card className="border-sfmc-200 bg-sfmc-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              Rapports détaillés
            </CardTitle>
            <CardDescription>
              Graphiques ventes / production, rapports qualité & stock, exports CSV — espace dédié.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="default" size="sm">
              <Link to="/reports">Ouvrir les rapports</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {pageMode === 'reports' && !isClient && (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ventes sur la période</CardTitle>
              <CardDescription>
                CA :{' '}
                <span className="font-semibold text-foreground">
                  {formatCurrency(salesChart?.totalRevenue ?? 0)}
                </span>{' '}
                — {salesChart?.totalOrders ?? 0} commande(s)
              </CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {salesByStatus.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Aucune donnée vente sur cette période.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesByStatus}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                    />
                    <Bar dataKey="count" fill="hsl(142 76% 36%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Production sur la période</CardTitle>
              <CardDescription>
                {productionChart?.totalProductionOrders ?? 0} ordre(s) —{' '}
                {productionChart?.completedCount ?? 0} terminé(s), {productionChart?.rejectedCount ?? 0}{' '}
                rejet(s)
              </CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {productionByStatus.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Aucun ordre de fabrication sur cette période.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productionByStatus}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <PackageCheck className="h-4 w-4" />
                  Rapport qualité
                </CardTitle>
                <CardDescription>
                  Période : {qualityReport?.period?.from ?? '—'} → {qualityReport?.period?.to ?? '—'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">Inspectés</div>
                    <div className="font-semibold">{qualityReport?.totalInspected ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Terminés</div>
                    <div className="font-semibold">{qualityReport?.completedCount ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Rejetés</div>
                    <div className="font-semibold">{qualityReport?.rejectedCount ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Taux échec</div>
                    <div className="font-semibold">
                      {qualityReport != null ? `${qualityReport.failureRate.toFixed(1)} %` : '—'}
                    </div>
                  </div>
                </div>
                {(qualityReport?.topRejectedProducts?.length ?? 0) > 0 ? (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produit</TableHead>
                          <TableHead className="text-right">Rejets</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {qualityRows.map((row) => (
                          <TableRow key={row.productId}>
                            <TableCell className="max-w-[min(100vw,20rem)]">
                              <div className="font-medium text-sm leading-tight">
                                {productLabel(row.productId)}
                              </div>
                              {!isKnownCatalogProductId(nameById, row.productId) && (
                                <div
                                  className="truncate font-mono text-[11px] text-muted-foreground"
                                  title={row.productId}
                                >
                                  {row.productId}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{row.rejectedCount}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {qualityRejected.length > QUALITY_PAGE_SIZE && (
                      <div className="flex items-center justify-between gap-2 pt-2 text-sm text-muted-foreground">
                        <span>
                          Page {qualityPageClamped + 1} / {qualityPageCount} ({qualityRejected.length} produits)
                        </span>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            disabled={qualityPageClamped <= 0}
                            onClick={() => setQualityTablePage((p) => Math.max(0, p - 1))}
                            aria-label="Page précédente"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            disabled={qualityPageClamped >= qualityPageCount - 1}
                            onClick={() => setQualityTablePage((p) => Math.min(qualityPageCount - 1, p + 1))}
                            aria-label="Page suivante"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucun rejet sur la période.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Boxes className="h-4 w-4" />
                  Rapport des stocks critiques
                </CardTitle>
                <CardDescription>
                  {stockReport?.totalAlerts ?? 0} alerte(s) — {stockReport?.distinctProducts ?? 0}{' '}
                  produit(s) distincts
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(stockReport?.latestSnapshots?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune alerte stock critique sur la période.</p>
                ) : (
                  <>
                    <div className="max-h-56 overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Produit</TableHead>
                            <TableHead>Qté</TableHead>
                            <TableHead>Seuil</TableHead>
                            <TableHead>Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {stockRows.map((row, i) => (
                            <TableRow key={`${row.productId}-${row.snapshotAt}-${i}`}>
                              <TableCell className="max-w-[min(100vw,20rem)]">
                                <div className="font-medium text-sm leading-tight">
                                  {productLabel(row.productId)}
                                </div>
                                {!isKnownCatalogProductId(nameById, row.productId) && (
                                  <div
                                    className="truncate font-mono text-[11px] text-muted-foreground"
                                    title={row.productId}
                                  >
                                    {row.productId}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>{row.quantity}</TableCell>
                              <TableCell>{row.threshold}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {new Date(row.snapshotAt).toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {stockSnapshots.length > STOCK_PAGE_SIZE && (
                      <div className="flex items-center justify-between gap-2 pt-2 text-sm text-muted-foreground">
                        <span>
                          Page {stockPageClamped + 1} / {stockPageCount} ({stockSnapshots.length} lignes)
                        </span>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            disabled={stockPageClamped <= 0}
                            onClick={() => setStockTablePage((p) => Math.max(0, p - 1))}
                            aria-label="Page précédente"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            disabled={stockPageClamped >= stockPageCount - 1}
                            onClick={() => setStockTablePage((p) => Math.min(stockPageCount - 1, p + 1))}
                            aria-label="Page suivante"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="h-4 w-4" />
                Exports tableur
              </CardTitle>
              <CardDescription>Même plage de dates que les filtres ci-dessus (ou toutes périodes).</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(
                ['sales', 'production', 'quality', 'stock', 'orders', 'invoices'] as ReportExportType[]
              ).map((t) => (
                <Button key={t} type="button" variant="outline" size="sm" onClick={() => downloadReportingCsv(t)}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  {REPORT_EXPORT_LABELS[t]}
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
        </>
      )}

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
              {isClient
                ? 'Le détail qualité atelier est réservé aux équipes SFMC.'
                : (kpis?.qualityFailureRate ?? 0) <= 5
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
              Orchestration RabbitMQ opérationnelle entre order, inventory, billing et production.
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
              {isClient
                ? 'Les mises à jour temps réel des indicateurs globaux sont réservées aux rôles internes.'
                : "Ce tableau se met à jour dès qu'une commande, facture ou ordre de production change d'état."}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
