import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'

const TABS: { to: string; label: string }[] = [
  { to: '/inventory/overview', label: "Vue d'ensemble" },
  { to: '/inventory/warehouses', label: 'Entrepôts' },
  { to: '/inventory/stock-lines', label: 'Lignes de stock' },
  { to: '/inventory/movements', label: 'Mouvements' },
  { to: '/inventory/pending-receptions', label: 'Réceptions en attente' },
  { to: '/inventory/tools', label: 'Outils avancés' },
  { to: '/inventory/graphql', label: 'Lecture avancée' },
]

export default function InventoryLayout() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end
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
