import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { Boxes, Download, PackageCheck, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useProductNameMap } from '@/hooks/use-product-name-map'
import { isKnownCatalogProductId } from '@/lib/catalog'
import { reportingCsvUrl, reportingService } from '@/services'
import { formatCurrency } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { extractErrorMessage } from '@/lib/api'
import type { ReportExportType } from '@/types/domain'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import {
  PRODUCTION_STATUS_LABELS,
  QUALITY_PAGE_SIZE,
  STATUS_LABELS,
  STOCK_PAGE_SIZE,
} from './dashboard/constants'
import { DashboardSummary } from './dashboard/DashboardSummary'
import { useDashboardCommon } from './dashboard/use-dashboard-common'

const REPORT_EXPORT_LABELS: Record<ReportExportType, string> = {
  sales: 'Ventes',
  production: 'Production',
  quality: 'Qualité',
  stock: 'Stocks',
  orders: 'Commandes',
  invoices: 'Factures',
}

const REPORT_EXPORT_TYPES = ['sales', 'production', 'quality', 'stock', 'orders', 'invoices'] as const satisfies readonly ReportExportType[]

/**
 * Analyses détaillées, graphiques et exports CSV (rôle interne).
 * La synthèse KPI + période est partagée avec l’accueil via `DashboardSummary`.
 */
export default function ReportsPage() {
  const ctx = useDashboardCommon()
  const { from, to, rangeParams } = ctx

  const [stockTablePage, setStockTablePage] = useState(0)
  const [qualityTablePage, setQualityTablePage] = useState(0)

  const { productLabel, nameById } = useProductNameMap({
    enabled: true,
    limit: 200,
  })

  const { data: salesPeriod } = useQuery({
    queryKey: ['reports', 'sales', from, to],
    queryFn: () => reportingService.sales(rangeParams),
    enabled: !!rangeParams,
  })

  const { data: productionPeriod } = useQuery({
    queryKey: ['reports', 'production', from, to],
    queryFn: () => reportingService.production(rangeParams),
    enabled: !!rangeParams,
  })

  const { data: salesAll } = useQuery({
    queryKey: ['reports', 'sales', 'all'],
    queryFn: () => reportingService.sales(),
    enabled: !rangeParams,
  })

  const { data: productionAll } = useQuery({
    queryKey: ['reports', 'production', 'all'],
    queryFn: () => reportingService.production(),
    enabled: !rangeParams,
  })

  const salesChart = rangeParams ? salesPeriod : salesAll
  const productionChart = rangeParams ? productionPeriod : productionAll

  const { data: qualityPeriod } = useQuery({
    queryKey: ['reports', 'quality', from, to],
    queryFn: () => reportingService.quality(rangeParams),
    enabled: !!rangeParams,
  })

  const { data: qualityAll } = useQuery({
    queryKey: ['reports', 'quality', 'all'],
    queryFn: () => reportingService.quality(),
    enabled: !rangeParams,
  })

  const qualityReport = rangeParams ? qualityPeriod : qualityAll

  const { data: stockPeriod } = useQuery({
    queryKey: ['reports', 'stock', from, to],
    queryFn: () => reportingService.stock(rangeParams),
    enabled: !!rangeParams,
  })

  const { data: stockAll } = useQuery({
    queryKey: ['reports', 'stock', 'all'],
    queryFn: () => reportingService.stock(),
    enabled: !rangeParams,
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
    setStockTablePage(0)
    setQualityTablePage(0)
  }, [from, to])

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

  const exportMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="h-10 shrink-0 gap-1.5 px-3">
          <Download className="h-4 w-4" aria-hidden />
          Exporter
          <ChevronDown className="h-4 w-4 opacity-70" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        {REPORT_EXPORT_TYPES.map((t) => (
          <DropdownMenuItem key={t} onSelect={() => void downloadReportingCsv(t)}>
            <Download className="mr-2 h-3.5 w-3.5 opacity-70" />
            {REPORT_EXPORT_LABELS[t]} (CSV)
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="space-y-6">
      <DashboardSummary
        ctx={ctx}
        periodToolbarEnd={exportMenu}
        showRealtimeDegradedNotice={false}
        intro={
          <p className="text-sm text-muted-foreground">
            Analyses ventes, production, qualité et stocks — les exports CSV utilisent la période ci-dessous
            (ou toutes périodes si les dates sont vides).
          </p>
        }
      />

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
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
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
              {productionChart?.totalProductionOrders ?? 0} ordre(s) — {productionChart?.completedCount ?? 0}{' '}
              terminé(s), {productionChart?.rejectedCount ?? 0} rejet(s)
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
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
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
                            <div className="font-medium text-sm leading-tight">{productLabel(row.productId)}</div>
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
                {stockReport?.totalAlerts ?? 0} alerte(s) — {stockReport?.distinctProducts ?? 0} produit(s)
                distincts
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
                              <div className="font-medium text-sm leading-tight">{productLabel(row.productId)}</div>
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
      </div>
    </div>
  )
}
