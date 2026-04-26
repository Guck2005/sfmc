import { Link } from 'react-router-dom'
import { BarChart3, CircleCheckBig, PackageCheck, Radio } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'

export default function HomePage() {
  const isClient = useAuthStore((s) => s.user?.role === 'CLIENT')

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          {isClient
            ? 'Espace client : accédez à vos commandes et factures depuis le menu.'
            : 'Vue d’ensemble : raccourcis utiles. Les indicateurs chiffrés, filtres par période et exports CSV sont sur la page Rapports.'}
        </p>
      </div>

      {!isClient && (
        <Card className="border-sfmc-200 bg-sfmc-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              Rapports détaillés
            </CardTitle>
            <CardDescription>
              Graphiques ventes / production, rapports qualité & stock, filtres par dates, exports CSV.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="default" size="sm">
              <Link to="/reports">Ouvrir les rapports</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PackageCheck className="h-4 w-4" />
              Qualité contrôle
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {isClient
                ? 'Le détail qualité atelier est réservé aux équipes SFMC.'
                : 'Suivi des contrôles et rejets : consultez la page Rapports.'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CircleCheckBig className="h-4 w-4" />
              Saga commandes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Orchestration RabbitMQ opérationnelle entre order, inventory, billing et production.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Radio className="h-4 w-4" />
              Événements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {isClient
                ? 'Les mises à jour temps réel des indicateurs globaux sont réservées aux rôles internes.'
                : 'Les indicateurs temps réel (KPI) sont disponibles sur la page Rapports.'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
