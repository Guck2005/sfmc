import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import type { UserRole } from '@/types/auth'

interface Props {
  roles?: UserRole[]
}

export function ProtectedRoute({ roles }: Props) {
  const location = useLocation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const hasRole = useAuthStore((s) => s.hasRole)

  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (roles && !hasRole(...roles)) {
    const allowed = roles.join(' ou ')
    return (
      <div className="p-10 text-center">
        <h2 className="text-xl font-semibold mb-2">Accès refusé</h2>
        <p className="text-muted-foreground">
          Cette section est réservée aux profils : <span className="font-medium text-foreground">{allowed}</span>.
          Votre compte n’a pas les droits nécessaires.
        </p>
      </div>
    )
  }

  return <Outlet />
}
