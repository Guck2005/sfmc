import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingCart,
  Factory,
  Receipt,
  Bell,
  Users,
  BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import type { UserRole } from '@/types/auth'

type NavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  roles?: UserRole[]
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard },
  { to: '/orders', label: 'Commandes', icon: ShoppingCart, roles: ['ADMIN', 'OPERATOR'] },
  { to: '/my-orders', label: 'Mes commandes', icon: ShoppingCart, roles: ['CLIENT'] },
  { to: '/products', label: 'Produits', icon: Package },
  { to: '/inventory', label: 'Stocks', icon: Boxes, roles: ['ADMIN', 'OPERATOR'] },
  { to: '/production', label: 'Production', icon: Factory, roles: ['ADMIN', 'OPERATOR'] },
  { to: '/billing', label: 'Facturation', icon: Receipt, roles: ['ADMIN', 'OPERATOR'] },
  { to: '/my-invoices', label: 'Mes factures', icon: Receipt, roles: ['CLIENT'] },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/reports', label: 'Rapports', icon: BarChart3, roles: ['ADMIN', 'OPERATOR'] },
  { to: '/users', label: 'Utilisateurs', icon: Users, roles: ['ADMIN'] },
]

export function Sidebar() {
  const hasRole = useAuthStore((s) => s.hasRole)
  const user = useAuthStore((s) => s.user)

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-card">
      <div className="h-16 flex items-center gap-2 px-5 border-b">
        <div className="p-1.5 bg-sfmc-600 rounded-md">
          <Factory className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">SFMC Bénin</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Back-office
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {NAV_ITEMS.filter((item) => !item.roles || hasRole(...item.roles)).map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sfmc-50 text-sfmc-700'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )
              }
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t p-4 text-xs text-muted-foreground">
        {user ? (
          <>
            <div className="font-medium text-foreground truncate">
              {user.fullName || user.email}
            </div>
            <div className="truncate">{user.role}</div>
          </>
        ) : null}
      </div>
    </aside>
  )
}
