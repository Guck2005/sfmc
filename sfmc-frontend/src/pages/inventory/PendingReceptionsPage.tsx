import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, PackageCheck } from 'lucide-react'

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
import { asArray } from '@/lib/pagination'
import { extractErrorMessage } from '@/lib/api'
import { DataTableEmpty } from '@/components/DataTableEmpty'
import type { PendingStockReception, Warehouse } from '@/types/domain'

export default function PendingReceptionsPage() {
  const qc = useQueryClient()
  const { productLabel } = useProductNameMap({ limit: 200 })
  const [confirmRow, setConfirmRow] = useState<PendingStockReception | null>(null)
  const [warehouseId, setWarehouseId] = useState<string>('')
  const [confirmQty, setConfirmQty] = useState<string>('')

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['pending-stock-receptions'],
    queryFn: () => inventoryService.listPendingReceptions(),
    refetchInterval: 15_000,
  })

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => inventoryService.listWarehouses(),
  })

  const warehouses = asArray<Warehouse>(warehousesData)
  const list = asArray<PendingStockReception>(rows)

  const confirmMutation = useMutation({
    mutationFn: (payload: { id: string; warehouseId: string; quantity?: number }) =>
      inventoryService.confirmPendingReception(payload.id, {
        warehouseId: payload.warehouseId,
        ...(payload.quantity != null ? { quantity: payload.quantity } : {}),
      }),
    onSuccess: () => {
      toast.success('Réception enregistrée — stock produit fini mis à jour')
      qc.invalidateQueries({ queryKey: ['pending-stock-receptions'] })
      qc.invalidateQueries({ queryKey: ['stocks'] })
      qc.invalidateQueries({ queryKey: ['stock-movements'] })
      setConfirmRow(null)
      setWarehouseId('')
      setConfirmQty('')
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4" />
            Réceptions en attente
          </CardTitle>
          <CardDescription>
            Après un contrôle qualité réussi, les quantités produites apparaissent ici jusqu’à ce que vous
            choisissiez l’entrepôt de destination et validiez la mise en stock.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Chargement…</div>
          ) : list.length === 0 ? (
            <DataTableEmpty message="Aucune réception en attente." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produit</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead>Ordre de fabrication</TableHead>
                  <TableHead className="w-12 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{productLabel(r.productId)}</TableCell>
                    <TableCell className="text-right font-mono">{r.quantity}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.productionOrderId.slice(0, 8)}…
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setConfirmRow(r)
                          setConfirmQty(String(r.quantity))
                          setWarehouseId('')
                        }}
                      >
                        Choisir l’entrepôt
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!confirmRow}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmRow(null)
            setWarehouseId('')
            setConfirmQty('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Valider la réception</DialogTitle>
            <DialogDescription>
              {confirmRow && (
                <>
                  {productLabel(confirmRow.productId)} — <strong>{confirmRow.quantity}</strong> unité(s) à
                  ajouter au stock produit fini.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Entrepôt de destination</Label>
            <Select value={warehouseId || undefined} onValueChange={setWarehouseId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un entrepôt" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="space-y-2 pt-2">
              <Label>Quantité à réceptionner</Label>
              <Input
                type="number"
                min={0.001}
                step="any"
                value={confirmQty}
                onChange={(e) => setConfirmQty(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmRow(null)}>
              Annuler
            </Button>
            <Button
              type="button"
              disabled={!warehouseId || !confirmRow || confirmMutation.isPending}
              onClick={() => {
                if (!confirmRow || !warehouseId) return
                const q = Number(confirmQty)
                if (!Number.isFinite(q) || q <= 0) {
                  toast.error('Indiquez une quantité valide')
                  return
                }
                if (q > confirmRow.quantity) {
                  toast.error('La quantité ne peut pas dépasser celle en attente')
                  return
                }
                confirmMutation.mutate({
                  id: confirmRow.id,
                  warehouseId,
                  quantity: q === confirmRow.quantity ? undefined : q,
                })
              }}
            >
              {confirmMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmer la mise en stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
