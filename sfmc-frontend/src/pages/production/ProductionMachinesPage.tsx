import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { RowActionsMenu } from '@/components/RowActionsMenu'
import { productionService } from '@/services'
import { asArray } from '@/lib/pagination'
import { extractErrorMessage } from '@/lib/api'
import { DataTableEmpty } from '@/components/DataTableEmpty'
import { useAuthStore } from '@/stores/auth-store'
import type { Machine, MachineStatus } from '@/types/domain'
import {
  MACHINE_CATEGORY_LABEL,
  MACHINE_CATEGORIES,
  MACHINE_STATUS_LABEL,
} from './production-shared'

const createMachineSchema = z.object({
  name: z.string().trim().min(2, '2 caractères minimum').max(120),
  category: z.enum(['__none__', 'CIMENT', 'FER', 'BRIQUES', 'GRANULATS']),
  status: z.enum(['AVAILABLE', 'IN_USE', 'MAINTENANCE']),
})
type CreateMachineForm = z.infer<typeof createMachineSchema>

export default function ProductionMachinesPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const canQA = useAuthStore((s) => s.hasRole('ADMIN', 'OPERATOR'))
  const [createOpen, setCreateOpen] = useState(false)

  const { data: machinesData } = useQuery({
    queryKey: ['machines'],
    queryFn: () => productionService.listMachines({ limit: 100 }),
    refetchInterval: 20_000,
  })

  const machines = asArray<Machine>(machinesData)

  const createForm = useForm<CreateMachineForm>({
    resolver: zodResolver(createMachineSchema),
    defaultValues: { name: '', category: '__none__', status: 'AVAILABLE' },
  })

  const machineStatusMutation = useMutation({
    mutationFn: (payload: { id: string; status: MachineStatus }) =>
      productionService.updateMachineStatus(payload.id, payload.status),
    onSuccess: () => {
      toast.success('Statut machine mis à jour')
      qc.invalidateQueries({ queryKey: ['machines'] })
      qc.invalidateQueries({ queryKey: ['machine'] })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; category?: Machine['category']; status?: MachineStatus }) =>
      productionService.createMachine(payload),
    onSuccess: (machine) => {
      toast.success('Machine créée')
      qc.invalidateQueries({ queryKey: ['machines'] })
      setCreateOpen(false)
      createForm.reset({ name: '', category: '__none__', status: 'AVAILABLE' })
      navigate(`/production/machines/${machine.id}`)
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const onCreateSubmit = createForm.handleSubmit((values) => {
    createMutation.mutate({
      name: values.name,
      ...(values.category !== '__none__' ? { category: values.category } : {}),
      status: values.status,
    })
  })

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <CardTitle>Machines</CardTitle>
          <CardDescription>Parc machines : suivi et mise à jour du statut opérationnel.</CardDescription>
        </div>
        {canQA ? (
          <Button size="sm" className="gap-1" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Nouvelle machine
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {machines.length === 0 ? (
          <DataTableEmpty message="Aucune machine enregistrée." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {machines.map((m) => (
                <TableRow
                  key={m.id}
                  className="cursor-pointer"
                  title="Voir la fiche machine"
                  onClick={() => navigate(`/production/machines/${m.id}`)}
                >
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>
                    {m.category ? MACHINE_CATEGORY_LABEL[m.category] : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{MACHINE_STATUS_LABEL[m.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end">
                      {canQA ? (
                        <RowActionsMenu ariaLabel={`Actions machine ${m.name}`}>
                          <DropdownMenuItem asChild>
                            <Link to={`/production/machines/${m.id}`}>Voir le détail</Link>
                          </DropdownMenuItem>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>Changer le statut</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              {(Object.keys(MACHINE_STATUS_LABEL) as MachineStatus[]).map((s) => (
                                <DropdownMenuItem
                                  key={s}
                                  disabled={s === m.status || machineStatusMutation.isPending}
                                  onClick={() =>
                                    machineStatusMutation.mutate({ id: m.id, status: s })
                                  }
                                >
                                  {MACHINE_STATUS_LABEL[s]}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        </RowActionsMenu>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o)
          if (!o) createForm.reset({ name: '', category: '__none__', status: 'AVAILABLE' })
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvelle machine</DialogTitle>
            <DialogDescription>
              Création d’une ligne de production. Le nom doit être unique dans votre usage opérationnel.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreateSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="machine-name">Nom</Label>
              <Input
                id="machine-name"
                autoComplete="off"
                placeholder="ex. LIGNE-CIMENT-02"
                {...createForm.register('name')}
              />
              {createForm.formState.errors.name ? (
                <p className="text-sm text-destructive">{createForm.formState.errors.name.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Catégorie (optionnel)</Label>
              <Select
                value={createForm.watch('category')}
                onValueChange={(v) =>
                  createForm.setValue('category', v as CreateMachineForm['category'])
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sans catégorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sans catégorie</SelectItem>
                  {MACHINE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {MACHINE_CATEGORY_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Statut initial</Label>
              <Select
                value={createForm.watch('status')}
                onValueChange={(v) =>
                  createForm.setValue('status', v as CreateMachineForm['status'])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MACHINE_STATUS_LABEL) as MachineStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {MACHINE_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="gap-2">
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Création…
                  </>
                ) : (
                  'Créer'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
