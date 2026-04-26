import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { History, Loader2, Plus } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { useProductNameMap } from '@/hooks/use-product-name-map'
import { inventoryService } from '@/services'
import { asArray, paginationMeta } from '@/lib/pagination'
import { extractErrorMessage } from '@/lib/api'
import { DataTableEmpty } from '@/components/DataTableEmpty'
import type { Stock, StockMovement, Warehouse } from '@/types/domain'
import {
  movementFormSchema,
  MOVEMENT_FILTER_ALL,
  movementOriginLabel,
  movementTypeLabel,
  warehouseLabel,
  type MovementFormOutput,
} from './inventory-shared'

const STOCKS_FETCH_PAGE_SIZE = 100

export default function InventoryMovementsPage() {
  const qc = useQueryClient()
  const [movementDialogOpen, setMovementDialogOpen] = useState(false)
  const [movementStockFilter, setMovementStockFilter] = useState(MOVEMENT_FILTER_ALL)

  const { data: stocksData } = useQuery({
    queryKey: ['stocks', 'all-for-movements'],
    queryFn: async () => {
      const acc: Stock[] = []
      let page = 1
      let lastPage = 1
      do {
        const res = await inventoryService.listStocks({ page, limit: STOCKS_FETCH_PAGE_SIZE })
        acc.push(...asArray<Stock>(res))
        lastPage = paginationMeta(res)?.lastPage ?? 1
        page++
      } while (page <= lastPage)
      return acc
    },
  })

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => inventoryService.listWarehouses(),
  })

  const movementParams =
    movementStockFilter === MOVEMENT_FILTER_ALL ? undefined : { stockId: movementStockFilter }

  const { data: movements = [], isLoading: loadingMovements } = useQuery({
    queryKey: ['stock-movements', movementParams],
    queryFn: () => inventoryService.listMovements(movementParams),
  })

  const stocks = stocksData ?? []
  const warehouses = asArray<Warehouse>(warehousesData)
  const { productLabel } = useProductNameMap({ limit: 200 })

  const stockById = useMemo(() => {
    const m = new Map<string, Stock>()
    for (const s of stocks) m.set(s.id, s)
    return m
  }, [stocks])

  const movementForm = useForm({
    resolver: zodResolver(movementFormSchema),
    defaultValues: {
      stockId: '',
      type: 'ADJUSTMENT' as const,
      quantity: 1,
      origin: 'AJUSTEMENT_MANUEL_UI',
      referenceId: '',
    },
  })

  const createMovementMutation = useMutation({
    mutationFn: (values: MovementFormOutput) =>
      inventoryService.createMovement({
        stockId: values.stockId,
        type: values.type,
        quantity: values.quantity,
        origin: values.origin,
        referenceId: values.referenceId?.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Mouvement enregistré')
      qc.invalidateQueries({ queryKey: ['stocks'] })
      qc.invalidateQueries({ queryKey: ['stock-movements'] })
      qc.invalidateQueries({ queryKey: ['stock-alerts'] })
      setMovementDialogOpen(false)
      movementForm.reset({
        stockId: '',
        type: 'ADJUSTMENT',
        quantity: 1,
        origin: 'AJUSTEMENT_MANUEL_UI',
        referenceId: '',
      })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Mouvements de stock
            </CardTitle>
            <CardDescription>
              Historique des mouvements et saisie manuelle (entrée, sortie, ajustement d’inventaire).
            </CardDescription>
          </div>
          <Button type="button" size="sm" onClick={() => setMovementDialogOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Nouveau mouvement
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-center">
            <Label className="shrink-0 text-xs text-muted-foreground">Filtrer par ligne</Label>
            <Select value={movementStockFilter} onValueChange={setMovementStockFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Toutes les lignes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={MOVEMENT_FILTER_ALL}>Toutes les lignes</SelectItem>
                {stocks.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="text-[11px] leading-tight">
                      <span className="font-medium">{productLabel(s.productId)}</span>
                      <span className="text-muted-foreground"> @ {warehouseLabel(s.warehouseId, warehouses)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {loadingMovements ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Chargement…</div>
          ) : movements.length === 0 ? (
            <DataTableEmpty message="Aucun mouvement sur la période / filtre." />
          ) : (
            <div className="max-h-[360px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Qté</TableHead>
                    <TableHead>Origine</TableHead>
                    <TableHead>Ligne</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(movements as StockMovement[]).map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {(m as { date?: string }).date?.slice(0, 19) ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{movementTypeLabel(m.type)}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{m.quantity}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm" title={m.origin}>
                        {movementOriginLabel(m.origin)}
                      </TableCell>
                      <TableCell className="max-w-[14rem] text-sm">
                        {(() => {
                          const st = stockById.get(m.stockId)
                          return st ? (
                            <span className="leading-tight">
                              <span className="font-medium">{productLabel(st.productId)}</span>
                              <span className="text-muted-foreground">
                                {' '}
                                · {warehouseLabel(st.warehouseId, warehouses)}
                              </span>
                            </span>
                          ) : (
                            <span className="font-mono text-[10px] text-muted-foreground" title={m.stockId}>
                              {m.stockId.slice(0, 8)}…
                            </span>
                          )
                        })()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau mouvement</DialogTitle>
            <DialogDescription>
              Quantité positive ; une sortie est refusée si le stock disponible est insuffisant.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={movementForm.handleSubmit((v) => createMovementMutation.mutate(v))}
          >
            <div className="space-y-1">
              <Label>Ligne de stock</Label>
              <Select
                value={movementForm.watch('stockId') || undefined}
                onValueChange={(id) => movementForm.setValue('stockId', id, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir une ligne" />
                </SelectTrigger>
                <SelectContent>
                  {stocks.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="text-[11px] leading-tight">
                        <span className="font-medium">{productLabel(s.productId)}</span>
                        <span className="text-muted-foreground">
                          {' '}
                          @ {warehouseLabel(s.warehouseId, warehouses)}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {movementForm.formState.errors.stockId && (
                <p className="text-xs text-destructive">{movementForm.formState.errors.stockId.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Type</Label>
                <Select
                  value={movementForm.watch('type')}
                  onValueChange={(t) =>
                    movementForm.setValue('type', t as MovementFormOutput['type'], { shouldValidate: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">Entrée</SelectItem>
                    <SelectItem value="OUT">Sortie</SelectItem>
                    <SelectItem value="ADJUSTMENT">Ajustement d&apos;inventaire</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Quantité</Label>
                <Input type="number" step="any" min={0} {...movementForm.register('quantity')} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Origine / motif</Label>
              <Input {...movementForm.register('origin')} />
            </div>
            <div className="space-y-1">
              <Label>Référence externe (optionnel)</Label>
              <Input {...movementForm.register('referenceId')} placeholder="ex. n° de bon ou de commande" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createMovementMutation.isPending}>
                {createMovementMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
