import { useQuery } from '@tanstack/react-query'
import { Bell, Mail, MessageSquare, Smartphone } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { notificationsService } from '@/services'
import { asArray } from '@/lib/pagination'
import { formatDateTime } from '@/lib/utils'
import { DataTableEmpty } from '@/components/DataTableEmpty'
import type { Notification } from '@/types/domain'

const TYPE_ICON = {
  EMAIL: Mail,
  SMS: MessageSquare,
  PUSH: Smartphone,
}

export default function NotificationsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsService.list({}),
    refetchInterval: 20_000,
  })

  const notifications = asArray<Notification>(data)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Historique des notifications
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Chargement…</div>
        ) : notifications.length === 0 ? (
          <DataTableEmpty message="Aucune notification envoyée" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Destinataire</TableHead>
                <TableHead>Sujet</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifications.map((n) => {
                const Icon = TYPE_ICON[n.type] ?? Bell
                return (
                  <TableRow key={n.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span>{n.type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{n.recipient}</TableCell>
                    <TableCell>{n.subject || '—'}</TableCell>
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
        )}
      </CardContent>
    </Card>
  )
}
