import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Boxes, Warehouse as WarehouseIcon } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useProductNameMap } from '@/hooks/use-product-name-map'
import { isKnownCatalogProductId } from '@/lib/catalog'
import { inventoryService } from '@/services'
import { asArray, paginationMeta } from '@/lib/pagination'
import type { StockAlert } from '@/types/domain'

export default function InventoryOverviewPage() {
  const { productLabel, nameById } = useProductNameMap({ limit: 200 })

  const { data: stocksData } = useQuery({
    queryKey: ['stocks', 'overview-kpi'],
    queryFn: () => inventoryService.listStocks({ page: 1, limit: 1 }),
  })

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => inventoryService.listWarehouses(),
  })

  const { data: alertsData } = useQuery({
    queryKey: ['stock-alerts'],
    queryFn: () => inventoryService.alerts(),
    refetchInterval: 15_000,
  })

  const refLineCount = paginationMeta(stocksData)?.total ?? 0
  const warehouses = asArray(warehousesData)
  const alerts = asArray<StockAlert>(alertsData)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-sfmc-100 p-3 text-sfmc-700">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Références</div>
              <div className="text-2xl font-bold">{refLineCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-emerald-100 p-3 text-emerald-700">
              <WarehouseIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Entrepôts</div>
              <div className="text-2xl font-bold">{warehouses.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-amber-100 p-3 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Alertes en cours</div>
              <div className="text-2xl font-bold">{alerts.length}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {alerts.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              Seuils critiques
            </CardTitle>
            <CardDescription>Produits en dessous du seuil de réapprovisionnement.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-md border bg-white px-4 py-2"
              >
                <div className="text-sm">
                  <div className="font-medium">{productLabel(a.productId)}</div>
                  {!isKnownCatalogProductId(nameById, a.productId) && (
                    <div className="text-[11px] text-muted-foreground font-mono truncate" title={a.productId}>
                      {a.productId}
                    </div>
                  )}
                  <span className="text-muted-foreground">
                    ({a.currentQuantity}/{a.threshold})
                  </span>
                </div>
                <Badge variant={a.severity === 'CRITICAL' ? 'destructive' : 'warning'}>
                  {a.severity === 'CRITICAL' ? 'Critique' : 'Attention'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
