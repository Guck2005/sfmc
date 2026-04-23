import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'

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
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { RowActionsMenu } from '@/components/RowActionsMenu'
import { inventoryService } from '@/services'
import { asArray } from '@/lib/pagination'
import { extractErrorMessage } from '@/lib/api'
import { DataTableEmpty } from '@/components/DataTableEmpty'
import type { Warehouse } from '@/types/domain'
import { warehouseSchema, type WarehouseFormInput, type WarehouseFormOutput } from './inventory-shared'

export default function InventoryWarehousesPage() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => inventoryService.listWarehouses(),
  })

  const warehouses = asArray<Warehouse>(warehousesData)

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
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Entrepôts</CardTitle>
          <CardDescription>{warehouses.length} entrepôt(s) référencé(s)</CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" />
              Nouvel entrepôt
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Modifier l'entrepôt" : 'Nouvel entrepôt'}</DialogTitle>
              <DialogDescription>
                La capacité est exprimée dans l'unité logistique retenue (tonnes, palettes…).
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
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
                <TableHead className="w-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouses.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">{w.name}</TableCell>
                  <TableCell className="text-muted-foreground">{w.location}</TableCell>
                  <TableCell className="text-right font-mono">{w.capacity}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      <RowActionsMenu ariaLabel={`Actions entrepôt ${w.name}`}>
                        <DropdownMenuItem onClick={() => openEdit(w)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            if (confirm(`Supprimer l'entrepôt "${w.name}" ?`)) {
                              deleteMutation.mutate(w.id)
                            }
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Supprimer
                        </DropdownMenuItem>
                      </RowActionsMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
