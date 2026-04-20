import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { AlertTriangle, Boxes, Loader2, Pencil, Plus, Trash2, Warehouse as WarehouseIcon } from 'lucide-react'

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
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { inventoryService } from '@/services'
import { asArray } from '@/lib/pagination'
import { extractErrorMessage } from '@/lib/api'
import { DataTableEmpty } from '@/components/DataTableEmpty'
import type { Stock, StockAlert, Warehouse } from '@/types/domain'

const warehouseSchema = z.object({
  name: z.string().min(2, '2 caractères minimum'),
  location: z.string().min(2, '2 caractères minimum'),
  capacity: z.coerce.number().positive('Doit être positif'),
})
type WarehouseFormInput = z.input<typeof warehouseSchema>
type WarehouseFormOutput = z.output<typeof warehouseSchema>

export default function InventoryPage() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: stocksData, isLoading: loadingStocks } = useQuery({
    queryKey: ['stocks'],
    queryFn: () => inventoryService.listStocks(),
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

  const stocks = asArray<Stock>(stocksData)
  const warehouses = asArray<Warehouse>(warehousesData)
  const alerts = asArray<StockAlert>(alertsData)

  const form = useForm<WarehouseFormInput, unknown, WarehouseFormOutput>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: { name: '', location: '', capacity: 0 },
  })

  function openCreate() {
    setEditing(null)
    form.reset({ name: '', location: '', capacity: 0 })
    setDialogOpen(true)
  }

  function openEdit(w: Warehouse) {
    setEditing(w)
    form.reset({ name: w.name, location: w.location, capacity: Number(w.capacity) })
    setDialogOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async (values: WarehouseFormOutput) => {
      if (editing) {
        return inventoryService.updateWarehouse(editing.id, values)
      }
      return inventoryService.createWarehouse(values)
    },
    onSuccess: () => {
      toast.success(editing ? 'Entrepôt mis à jour' : 'Entrepôt créé')
      qc.invalidateQueries({ queryKey: ['warehouses'] })
      setDialogOpen(false)
      setEditing(null)
      form.reset()
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => inventoryService.removeWarehouse(id),
    onSuccess: () => {
      toast.success('Entrepôt supprimé')
      qc.invalidateQueries({ queryKey: ['warehouses'] })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-lg bg-sfmc-100 text-sfmc-700 p-3">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Références</div>
              <div className="text-2xl font-bold">{stocks.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-lg bg-emerald-100 text-emerald-700 p-3">
              <WarehouseIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Entrepôts</div>
              <div className="text-2xl font-bold">{warehouses.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-lg bg-amber-100 text-amber-700 p-3">
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
            <CardTitle className="text-base flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              Seuils critiques
            </CardTitle>
            <CardDescription>
              Produits en dessous du seuil de réapprovisionnement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-md border bg-white px-4 py-2"
              >
                <div className="text-sm">
                  <span className="font-medium">{a.productId}</span>{' '}
                  <span className="text-muted-foreground">
                    ({a.currentQuantity}/{a.threshold})
                  </span>
                </div>
                <Badge variant={a.severity === 'CRITICAL' ? 'destructive' : 'warning'}>
                  {a.severity}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Entrepôts</CardTitle>
            <CardDescription>{warehouses.length} entrepôt(s) référencé(s)</CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" />
                Nouvel entrepôt
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? 'Modifier l\'entrepôt' : 'Nouvel entrepôt'}</DialogTitle>
                <DialogDescription>
                  La capacité est exprimée dans l'unité logistique retenue (tonnes, palettes…).
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <Label>Nom</Label>
                  <Input {...form.register('name')} />
                </div>
                <div className="space-y-1">
                  <Label>Localisation</Label>
                  <Input {...form.register('location')} />
                </div>
                <div className="space-y-1">
                  <Label>Capacité</Label>
                  <Input type="number" min={1} {...form.register('capacity')} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editing ? 'Enregistrer' : 'Créer'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {warehouses.length === 0 ? (
            <DataTableEmpty message="Aucun entrepôt enregistré." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Localisation</TableHead>
                  <TableHead className="text-right">Capacité</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {warehouses.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell className="text-muted-foreground">{w.location}</TableCell>
                    <TableCell className="text-right font-mono">{w.capacity}</TableCell>
                    <TableCell className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(w)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Supprimer l'entrepôt "${w.name}" ?`)) {
                            deleteMutation.mutate(w.id)
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>État des stocks</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingStocks ? (
            <div className="py-12 text-center text-muted-foreground">Chargement…</div>
          ) : stocks.length === 0 ? (
            <DataTableEmpty message="Aucun stock enregistré." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produit</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead className="text-right">Réservé</TableHead>
                  <TableHead className="text-right">Disponible</TableHead>
                  <TableHead className="text-right">Seuil</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stocks.map((s) => {
                  const available = Number(s.quantity) - Number(s.reserved)
                  const low = available <= Number(s.threshold)
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.productId}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.stockType}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{s.quantity}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {s.reserved}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono font-semibold ${low ? 'text-amber-700' : ''}`}
                      >
                        {available}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {s.threshold}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
