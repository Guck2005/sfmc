import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

const TITLES: Record<string, string> = {
  '/': 'Accueil',
  '/orders': 'Commandes',
  '/products': 'Catalogue produits',
  '/inventory/overview': "Stocks — Vue d'ensemble",
  '/inventory/warehouses': 'Stocks — Entrepôts',
  '/inventory/stock-lines': 'Stocks — Lignes',
  '/inventory/movements': 'Stocks — Mouvements',
  '/inventory/pending-receptions': 'Stocks — Réceptions en attente',
  '/inventory/tools': 'Stocks — Outils avancés',
  '/inventory/graphql': 'Stocks — Lecture avancée',
  '/inventory': 'Gestion des stocks',
  '/production/orders': 'Production — Ordres',
  '/production/machines': 'Production — Machines',
  '/production': 'Production',
  '/billing': 'Facturation',
  '/notifications': 'Notifications',
  '/reports': 'Rapports',
  '/users': 'Utilisateurs',
  '/profile': 'Mon profil',
}

export function AppShell() {
  const location = useLocation()
  const title =
    TITLES[location.pathname] ??
    Object.entries(TITLES).find(([p]) => p !== '/' && location.pathname.startsWith(p))?.[1] ??
    'SFMC'

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar title={title} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
