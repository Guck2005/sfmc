import type { LucideIcon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'

export interface KpiCardProps {
  title: string
  value: string
  icon: LucideIcon
  hint?: string
  tone?: 'default' | 'warning' | 'success'
}

export function KpiCard({ title, value, icon: Icon, hint, tone = 'default' }: KpiCardProps) {
  const toneCls =
    tone === 'warning'
      ? 'bg-amber-100 text-amber-700'
      : tone === 'success'
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-sfmc-100 text-sfmc-700'
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
            <div className="mt-2 text-2xl font-bold">{value}</div>
            {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
          </div>
          <div className={`rounded-lg p-2.5 ${toneCls}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
