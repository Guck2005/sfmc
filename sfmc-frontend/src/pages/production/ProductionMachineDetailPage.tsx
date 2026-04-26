import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { RowActionsMenu } from '@/components/RowActionsMenu'
import { productionService } from '@/services'
import { extractErrorMessage } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import type { MachineStatus } from '@/types/domain'
import {
  MACHINE_CATEGORY_LABEL,
  MACHINE_STATUS_LABEL,
} from './production-shared'

export default function ProductionMachineDetailPage() {
  const { machineId } = useParams<{ machineId: string }>()
  const qc = useQueryClient()
  const canEdit = useAuthStore((s) => s.hasRole('ADMIN', 'OPERATOR'))

  const { data: machine, isLoading, isError, error } = useQuery({
    queryKey: ['machine', machineId],
    queryFn: () => productionService.getMachine(machineId!),
    enabled: !!machineId,
  })

  const machineStatusMutation = useMutation({
    mutationFn: (payload: { id: string; status: MachineStatus }) =>
      productionService.updateMachineStatus(payload.id, payload.status),
    onSuccess: (updated) => {
      toast.success('Statut machine mis à jour')
      qc.setQueryData(['machine', machineId], updated)
      qc.invalidateQueries({ queryKey: ['machines'] })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  if (!machineId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Machine introuvable</CardTitle>
          <CardDescription>Identifiant manquant dans l’URL.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link to="/production/machines">Retour à la liste</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">Chargement…</CardContent>
      </Card>
    )
  }

  if (isError || !machine) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Machine introuvable</CardTitle>
          <CardDescription>{extractErrorMessage(error)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link to="/production/machines">Retour à la liste</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1">
          <Link to="/production/machines">
            <ArrowLeft className="size-4" />
            Liste des machines
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-2xl">{machine.name}</CardTitle>
            <CardDescription>
              Identifiant <span className="font-mono text-xs">{machine.id}</span>
            </CardDescription>
          </div>
          {canEdit ? (
            <RowActionsMenu ariaLabel={`Actions machine ${machine.name}`}>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Changer le statut</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {(Object.keys(MACHINE_STATUS_LABEL) as MachineStatus[]).map((s) => (
                    <DropdownMenuItem
                      key={s}
                      disabled={s === machine.status || machineStatusMutation.isPending}
                      onClick={() => machineStatusMutation.mutate({ id: machine.id, status: s })}
                    >
                      {MACHINE_STATUS_LABEL[s]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </RowActionsMenu>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Catégorie</p>
            <p className="font-medium">
              {machine.category ? MACHINE_CATEGORY_LABEL[machine.category] : '—'}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Statut</p>
            <Badge variant="outline" className="mt-0.5">
              {MACHINE_STATUS_LABEL[machine.status]}
            </Badge>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Créée le</p>
            <p className="font-medium">{formatDate(machine.createdAt)}</p>
          </div>
          {machine.updatedAt ? (
            <div>
              <p className="text-sm text-muted-foreground">Dernière mise à jour</p>
              <p className="font-medium">{formatDate(machine.updatedAt)}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
