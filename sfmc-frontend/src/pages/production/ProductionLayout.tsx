import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'

const TABS: { to: string; label: string }[] = [
  { to: '/production/orders', label: 'Ordres de fabrication' },
  { to: '/production/machines', label: 'Machines' },
]

export default function ProductionLayout() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/production/orders'}
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
