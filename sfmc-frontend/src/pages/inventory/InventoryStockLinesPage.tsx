import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Loader2, SlidersHorizontal, Warehouse as WarehouseIcon } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { RowActionsMenu } from '@/components/RowActionsMenu'
import { inventoryService } from '@/services'
import { asArray, paginationMeta } from '@/lib/pagination'
import { useProductNameMap } from '@/hooks/use-product-name-map'
import { extractErrorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { DataTableEmpty } from '@/components/DataTableEmpty'
import { useAuthStore } from '@/stores/auth-store'
import type { Stock, Warehouse } from '@/types/domain'
import { isKnownCatalogProductId } from '@/lib/catalog'
import { warehouseLabel } from './inventory-shared'

const STOCK_LINES_PAGE_SIZE = 20

export default function InventoryStockLinesPage() {
  const qc = useQueryClient()
  const isAdmin = useAuthStore((s) => s.hasRole('ADMIN'))

  const [productWarehousesOpen, setProductWarehousesOpen] = useState(false)
  const [detailProductId, setDetailProductId] = useState<string | null>(null)
  const [thresholdStock, setThresholdStock] = useState<Stock | null>(null)
  const [thresholdInput, setThresholdInput] = useState('')
  const [stocksPage, setStocksPage] = useState(1)

  const listParams = useMemo(
    () => ({ page: stocksPage, limit: STOCK_LINES_PAGE_SIZE }),
    [stocksPage]
  )

  const { data: stocksData, isLoading: loadingStocks } = useQuery({
    queryKey: ['stocks', 'lines', listParams],
    queryFn: () => inventoryService.listStocks(listParams),
  })

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => inventoryService.listWarehouses(),
  })

  const { productLabel, nameById } = useProductNameMap({ limit: 200 })

  const { data: byProductRows = [], isFetching: loadingByProduct } = useQuery({
    queryKey: ['stocks-by-product', detailProductId],
    queryFn: () => inventoryService.byProduct(detailProductId!),
    enabled: productWarehousesOpen && !!detailProductId,
  })

  const stocks = asArray<Stock>(stocksData)
  const stocksListMeta = paginationMeta(stocksData)
  const stocksTotal = stocksListMeta?.total ?? 0
  const warehouses = asArray<Warehouse>(warehousesData)

  function openProductWarehouses(productId: string) {
    setDetailProductId(productId)
    setProductWarehousesOpen(true)
  }

  function openThreshold(stock: Stock) {
    setThresholdStock(stock)
    setThresholdInput(String(stock.threshold))
  }

  const thresholdMutation = useMutation({
    mutationFn: async () => {
      if (!thresholdStock) throw new Error('Stock manquant')
      const n = Number(thresholdInput)
      if (Number.isNaN(n) || n < 0) throw new Error('Seuil invalide')
      return inventoryService.updateThreshold(thresholdStock.id, n)
    },
    onSuccess: () => {
      toast.success('Seuil mis à jour')
      qc.invalidateQueries({ queryKey: ['stocks'] })
      qc.invalidateQueries({ queryKey: ['stock-alerts'] })
      setThresholdStock(null)
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>État des stocks</CardTitle>
          <CardDescription>
            Détail multi-entrepôts par produit, seuil (ADMIN) et base des mouvements.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingStocks ? (
            <div className="py-12 text-center text-muted-foreground">Chargement…</div>
          ) : stocksTotal === 0 ? (
            <DataTableEmpty message="Aucun stock enregistré." />
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produit</TableHead>
                  <TableHead>Entrepôt</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead className="text-right">Réservé</TableHead>
                  <TableHead className="text-right">Disponible</TableHead>
                  <TableHead className="text-right">Seuil</TableHead>
                  <TableHead className="w-12 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stocks.map((s) => {
                  const available = Number(s.quantity) - Number(s.reserved)
                  const low = available <= Number(s.threshold)
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="max-w-[min(100vw,22rem)]">
                        <div className="font-medium leading-tight">
                          {productLabel(s.productId)}
                        </div>
                        {!isKnownCatalogProductId(nameById, s.productId) && (
                          <div
                            className="truncate font-mono text-[11px] text-muted-foreground"
                            title={s.productId}
                          >
                            {s.productId}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {warehouseLabel(s.warehouseId, warehouses)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{s.quantity}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {s.reserved}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-mono font-semibold',
                          low ? 'text-amber-700' : ''
                        )}
                      >
                        {available}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {s.threshold}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">
                          <RowActionsMenu ariaLabel={`Actions stock ${s.productId.slice(0, 8)}`}>
                            <DropdownMenuItem onClick={() => openProductWarehouses(s.productId)}>
                              <WarehouseIcon className="mr-2 h-4 w-4" />
                              Répartition par entrepôt
                            </DropdownMenuItem>
                            {isAdmin && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => openThreshold(s)}>
                                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                                  Modifier le seuil
                                </DropdownMenuItem>
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
            {stocksListMeta && stocksListMeta.total > 0 ? (
              <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Page <span className="font-medium text-foreground">{stocksListMeta.page}</span> sur{' '}
                  <span className="font-medium text-foreground">{stocksListMeta.lastPage}</span>
                  {' · '}
                  {stocksListMeta.total} ligne{stocksListMeta.total > 1 ? 's' : ''} au total
                  {stocksListMeta.total > stocks.length ? (
                    <span className="text-muted-foreground">
                      {' '}
                      ({stocks.length} affichée{stocks.length > 1 ? 's' : ''} sur cette page)
                    </span>
                  ) : null}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={stocksPage <= 1 || loadingStocks}
                    onClick={() => setStocksPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Précédent
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={stocksPage >= stocksListMeta.lastPage || loadingStocks}
                    onClick={() => setStocksPage((p) => Math.min(stocksListMeta.lastPage, p + 1))}
                  >
                    Suivant
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={productWarehousesOpen}
        onOpenChange={(o) => {
          setProductWarehousesOpen(o)
          if (!o) setDetailProductId(null)
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Répartition par entrepôt</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="font-medium text-foreground">
                  {detailProductId ? productLabel(detailProductId, 'Produit') : ''}
                </div>
                {detailProductId && !isKnownCatalogProductId(nameById, detailProductId) && (
                  <div className="break-all font-mono text-xs">{detailProductId}</div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          {loadingByProduct ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : byProductRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune ligne de stock pour ce produit.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entrepôt</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead className="text-right">Dispo</TableHead>
                  <TableHead className="text-right">Seuil</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byProductRows.map((row) => {
                  const disp = Number(row.quantity) - Number(row.reserved)
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{warehouseLabel(row.warehouseId, warehouses)}</TableCell>
                      <TableCell className="text-right font-mono">{row.quantity}</TableCell>
                      <TableCell className="text-right font-mono">{disp}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {row.threshold}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!thresholdStock} onOpenChange={(o) => !o && setThresholdStock(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le seuil d’alerte</DialogTitle>
            <DialogDescription>
              {thresholdStock
                ? `${productLabel(thresholdStock.productId)} — ${warehouseLabel(thresholdStock.warehouseId, warehouses)} (administrateur).`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nouveau seuil</Label>
            <Input
              type="number"
              min={0}
              step={1}
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setThresholdStock(null)}>
              Annuler
            </Button>
            <Button onClick={() => thresholdMutation.mutate()} disabled={thresholdMutation.isPending}>
              {thresholdMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
