import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'

export function DataTableEmpty({
  message = 'Aucune donnée',
  action,
}: {
  message?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-muted p-3 mb-3">
        <Inbox className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground mb-3">{message}</p>
      {action}
    </div>
  )
}
