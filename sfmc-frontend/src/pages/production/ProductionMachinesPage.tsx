import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import { MACHINE_STATUS_LABEL } from './production-shared'

export default function ProductionMachinesPage() {
  const qc = useQueryClient()
  const canQA = useAuthStore((s) => s.hasRole('ADMIN', 'OPERATOR'))

  const { data: machinesData } = useQuery({
    queryKey: ['machines'],
    queryFn: () => productionService.listMachines({ limit: 100 }),
    refetchInterval: 20_000,
  })

  const machines = asArray<Machine>(machinesData)

  const machineStatusMutation = useMutation({
    mutationFn: (payload: { id: string; status: MachineStatus }) =>
      productionService.updateMachineStatus(payload.id, payload.status),
    onSuccess: () => {
      toast.success('Statut machine mis à jour')
      qc.invalidateQueries({ queryKey: ['machines'] })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Machines</CardTitle>
        <CardDescription>Parc machines : suivi et mise à jour du statut opérationnel.</CardDescription>
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
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>{m.category ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{MACHINE_STATUS_LABEL[m.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      {canQA ? (
                        <RowActionsMenu ariaLabel={`Actions machine ${m.name}`}>
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
    </Card>
  )
}
