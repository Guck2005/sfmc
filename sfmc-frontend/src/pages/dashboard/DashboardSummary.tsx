import type { ReactNode } from 'react'
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
  DollarSign,
  Factory,
  ShoppingCart,
  Radio,
  Boxes,
  FileText,
  CalendarRange,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils'

import { KpiCard } from './KpiCard'
import type { DashboardCommonState } from './use-dashboard-common'

export function DashboardSummary({
  ctx,
  intro,
  periodToolbarEnd,
  /** Affiche l’avertissement si le WebSocket reporting est indisponible (désactivé sur la page Rapports). */
  showRealtimeDegradedNotice = true,
}: {
  ctx: DashboardCommonState
  intro: ReactNode
  /** Ex. menu « Exporter » (page Rapports), aligné sur la ligne des dates. */
  periodToolbarEnd?: ReactNode
  showRealtimeDegradedNotice?: boolean
}) {
  const {
    from,
    to,
    setFrom,
    setTo,
    is503,
    error,
    isLoading,
    kpis,
    periodLabel,
    ordersByStatus,
    isClient,
    pendingProduction,
    liveStatus,
    wsDegraded,
  } = ctx

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          {intro}
          {showRealtimeDegradedNotice && wsDegraded && !isClient && (
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
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarRange className="h-4 w-4" />
            Période d'analyse
          </CardTitle>
          <CardDescription>
            Les indicateurs se mettent à jour dès que vous modifiez les dates (comme sur la liste des
            commandes). Laissez les champs vides pour toutes les périodes. Les exports CSV utilisent la même
            plage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3 md:gap-4">
            <div className="space-y-1">
              <Label htmlFor="dash-from" className="text-xs text-muted-foreground">
                Début
              </Label>
              <Input
                id="dash-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-10 w-[11rem] shrink-0"
                aria-label="Période — date de début"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dash-to" className="text-xs text-muted-foreground">
                Fin
              </Label>
              <Input
                id="dash-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-10 w-[11rem] shrink-0"
                aria-label="Période — date de fin"
              />
            </div>
            {periodToolbarEnd ? (
              <div className="flex shrink-0 items-center pb-0.5 md:ml-auto">{periodToolbarEnd}</div>
            ) : null}
          </div>
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
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
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
                <Badge variant={(kpis?.criticalStockCount ?? 0) > 0 ? 'destructive' : 'outline'}>
                  {kpis?.criticalStockCount ?? 0}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
