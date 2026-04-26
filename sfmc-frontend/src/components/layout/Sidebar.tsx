import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
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
  ChevronDown,
  Briefcase,
  Warehouse,
  LineChart,
  Shield,
  History,
  PackageCheck,
  // SlidersHorizontal, // réservé entrée « Outils saga » (masquée)
  // Braces, // réservé entrée « GraphQL » (masquée)
  ClipboardList,
  Cog,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import type { UserRole } from '@/types/auth'

type NavLinkDef = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  roles?: UserRole[]
  /** Si true, actif seulement sur l’URL exacte (sous-routes inventaire / production). */
  end?: boolean
}

type NavGroupDef = {
  id: string
  label: string
  icon: typeof Briefcase
  items: NavLinkDef[]
}

const DASHBOARD_ITEM: NavLinkDef = {
  to: '/',
  label: 'Accueil',
  icon: LayoutDashboard,
  end: true,
}

const NAV_GROUPS: NavGroupDef[] = [
  {
    id: 'commercial',
    label: 'Commercial',
    icon: Briefcase,
    items: [
      { to: '/products', label: 'Produits', icon: Package },
      { to: '/orders', label: 'Commandes', icon: ShoppingCart, roles: ['ADMIN', 'OPERATOR'] },
      { to: '/my-orders', label: 'Mes commandes', icon: ShoppingCart, roles: ['CLIENT'] },
      { to: '/billing', label: 'Facturation', icon: Receipt, roles: ['ADMIN', 'OPERATOR'] },
      { to: '/my-invoices', label: 'Mes factures', icon: Receipt, roles: ['CLIENT'] },
    ],
  },
  {
    id: 'stocks',
    label: 'Stocks',
    icon: Boxes,
    items: [
      {
        to: '/inventory/overview',
        label: "Vue d'ensemble",
        icon: LayoutDashboard,
        roles: ['ADMIN', 'OPERATOR'],
        end: true,
      },
      {
        to: '/inventory/warehouses',
        label: 'Entrepôts',
        icon: Warehouse,
        roles: ['ADMIN', 'OPERATOR'],
        end: true,
      },
      {
        to: '/inventory/stock-lines',
        label: 'Lignes de stock',
        icon: Package,
        roles: ['ADMIN', 'OPERATOR'],
        end: true,
      },
      {
        to: '/inventory/movements',
        label: 'Mouvements',
        icon: History,
        roles: ['ADMIN', 'OPERATOR'],
        end: true,
      },
      {
        to: '/inventory/pending-receptions',
        label: 'Réceptions en attente',
        icon: PackageCheck,
        roles: ['ADMIN', 'OPERATOR'],
        end: true,
      },
      // Masqués temporairement — routes toujours déclarées dans App.tsx
      // {
      //   to: '/inventory/tools',
      //   label: 'Outils saga',
      //   icon: SlidersHorizontal,
      //   roles: ['ADMIN', 'OPERATOR'],
      //   end: true,
      // },
      // {
      //   to: '/inventory/graphql',
      //   label: 'GraphQL',
      //   icon: Braces,
      //   roles: ['ADMIN', 'OPERATOR'],
      //   end: true,
      // },
    ],
  },
  {
    id: 'production',
    label: 'Production',
    icon: Factory,
    items: [
      {
        to: '/production/orders',
        label: 'Ordres de fabrication',
        icon: ClipboardList,
        roles: ['ADMIN', 'OPERATOR'],
        end: true,
      },
      {
        to: '/production/machines',
        label: 'Machines',
        icon: Cog,
        roles: ['ADMIN', 'OPERATOR'],
        end: true,
      },
    ],
  },
  {
    id: 'pilotage',
    label: 'Pilotage',
    icon: LineChart,
    items: [{ to: '/reports', label: 'Rapports', icon: BarChart3, roles: ['ADMIN', 'OPERATOR'] }],
  },
  {
    id: 'administration',
    label: 'Administration',
    icon: Shield,
    items: [{ to: '/users', label: 'Utilisateurs', icon: Users, roles: ['ADMIN'] }],
  },
]

const NOTIFICATIONS_ITEM: NavLinkDef = {
  to: '/notifications',
  label: 'Notifications',
  icon: Bell,
}

function pathMatchesItem(pathname: string, to: string, end?: boolean): boolean {
  if (end) return pathname === to
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}

function navItemIsActive(pathname: string, item: NavLinkDef): boolean {
  return pathMatchesItem(pathname, item.to, item.end)
}

function groupHasActivePath(pathname: string, items: NavLinkDef[]): boolean {
  return items.some((item) => navItemIsActive(pathname, item))
}

function NavItemLink({ item }: { item: NavLinkDef }) {
  const Icon = item.icon
  const { pathname } = useLocation()
  const active = navItemIsActive(pathname, item)

  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-sfmc-50 text-sfmc-700'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </NavLink>
  )
}

function NavDropdown({
  group,
  visibleItems,
  pathname,
}: {
  group: NavGroupDef
  visibleItems: NavLinkDef[]
  pathname: string
}) {
  const routeWantsOpen = useMemo(
    () => groupHasActivePath(pathname, visibleItems),
    [pathname, visibleItems]
  )
  const [open, setOpen] = useState(() => routeWantsOpen)

  useEffect(() => {
    if (routeWantsOpen) setOpen(true)
  }, [routeWantsOpen])

  const toggle = useCallback(() => setOpen((v) => !v), [])
  const GroupIcon = group.icon

  return (
    <div className="rounded-md border border-transparent">
      <button
        type="button"
        onClick={toggle}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-foreground transition-colors',
          'hover:bg-accent/80'
        )}
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <GroupIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{group.label}</span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 border-l border-border/80 py-1 pl-2 ml-3">
          {visibleItems.map((item) => (
            <NavItemLink key={item.to} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  const hasRole = useAuthStore((s) => s.hasRole)
  const user = useAuthStore((s) => s.user)
  const { pathname } = useLocation()

  const filterItems = (items: NavLinkDef[]) =>
    items.filter((item) => !item.roles || hasRole(...item.roles))

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

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-3">
        <div>
          <NavItemLink item={DASHBOARD_ITEM} />
        </div>

        {NAV_GROUPS.map((group) => {
          const visibleItems = filterItems(group.items)
          if (visibleItems.length === 0) return null
          return <NavDropdown key={group.id} group={group} visibleItems={visibleItems} pathname={pathname} />
        })}

        <div className="pt-1 border-t border-border/60">
          <NavItemLink item={NOTIFICATIONS_ITEM} />
        </div>
      </nav>

      <div className="border-t p-4 text-xs text-muted-foreground">
        {user ? (
          <>
            <div className="font-medium text-foreground truncate">{user.fullName || user.email}</div>
            <div className="truncate">{user.role}</div>
          </>
        ) : null}
      </div>
    </aside>
  )
}
