import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell, ChevronLeft, ChevronRight, Mail, MessageSquare, Smartphone } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
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
import { Label } from '@/components/ui/label'
import { notificationsService } from '@/services'
import { asArray, paginationMeta } from '@/lib/pagination'
import { formatDateTime } from '@/lib/utils'
import { DataTableEmpty } from '@/components/DataTableEmpty'
import type { Notification } from '@/types/domain'

const NOTIFICATIONS_PAGE_SIZE = 20

const CHANNEL_ICONS: Record<string, typeof Mail> = {
  EMAIL: Mail,
  SMS: MessageSquare,
  PUSH: Smartphone,
}

function payloadPreview(raw: string | null | undefined): string {
  if (!raw) return '—'
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export default function NotificationsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('__all__')
  const [channelFilter, setChannelFilter] = useState<string>('__all__')
  const [notificationsPage, setNotificationsPage] = useState(1)
  const [detailId, setDetailId] = useState<string | null>(null)

  useEffect(() => {
    setNotificationsPage(1)
  }, [statusFilter, channelFilter])

  const listParams = {
    page: notificationsPage,
    limit: NOTIFICATIONS_PAGE_SIZE,
    ...(statusFilter !== '__all__' ? { status: statusFilter } : {}),
    ...(channelFilter !== '__all__' ? { channel: channelFilter } : {}),
  }

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', listParams],
    queryFn: () => notificationsService.list(listParams),
    refetchInterval: 20_000,
  })

  const { data: detail, isFetching: loadingDetail } = useQuery({
    queryKey: ['notification', detailId],
    queryFn: () => notificationsService.get(detailId!),
    enabled: !!detailId,
  })

  const notifications = asArray<Notification>(data)
  const listMeta = paginationMeta(data)

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Historique des notifications
        </CardTitle>
        <div className="flex flex-wrap gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Statut</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tous</SelectItem>
                <SelectItem value="PENDING">PENDING</SelectItem>
                <SelectItem value="SENT">SENT</SelectItem>
                <SelectItem value="FAILED">FAILED</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Canal</Label>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tous</SelectItem>
                <SelectItem value="EMAIL">EMAIL</SelectItem>
                <SelectItem value="SMS">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Chargement…</div>
        ) : notifications.length === 0 ? (
          <DataTableEmpty message="Aucune notification pour ces filtres" />
        ) : (
          <>
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Canal</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Destinataire</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifications.map((n) => {
                const Icon = CHANNEL_ICONS[n.channel] ?? Bell
                return (
                  <TableRow
                    key={n.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setDetailId(n.id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span>{n.channel}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{n.type}</TableCell>
                    <TableCell className="font-mono text-xs">{n.recipient}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          n.status === 'SENT'
                            ? 'success'
                            : n.status === 'FAILED'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {n.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(n.createdAt)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
            {listMeta && listMeta.total > 0 ? (
              <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Page <span className="font-medium text-foreground">{listMeta.page}</span> sur{' '}
                  <span className="font-medium text-foreground">{listMeta.lastPage}</span>
                  {' · '}
                  {listMeta.total} notification{listMeta.total > 1 ? 's' : ''} au total
                  {listMeta.total > notifications.length ? (
                    <span className="text-muted-foreground">
                      {' '}
                      ({notifications.length} affichée{notifications.length > 1 ? 's' : ''} sur cette page)
                    </span>
                  ) : null}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={notificationsPage <= 1 || isLoading}
                    onClick={() => setNotificationsPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Précédent
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={notificationsPage >= listMeta.lastPage || isLoading}
                    onClick={() => setNotificationsPage((p) => Math.min(listMeta.lastPage, p + 1))}
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

      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Détail notification</DialogTitle>
          </DialogHeader>
          {loadingDetail ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : detail ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">ID</span>
                <span className="font-mono text-xs break-all">{detail.id}</span>
                <span className="text-muted-foreground">Type</span>
                <span className="font-mono">{detail.type}</span>
                <span className="text-muted-foreground">Canal</span>
                <span>{detail.channel}</span>
                <span className="text-muted-foreground">Destinataire</span>
                <span className="font-mono text-xs break-all">{detail.recipient}</span>
                <span className="text-muted-foreground">Statut</span>
                <Badge variant={detail.status === 'SENT' ? 'success' : 'secondary'}>{detail.status}</Badge>
                <span className="text-muted-foreground">Créé</span>
                <span>{formatDateTime(detail.createdAt)}</span>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Payload</div>
                <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
                  {payloadPreview(detail.payload)}
                </pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
