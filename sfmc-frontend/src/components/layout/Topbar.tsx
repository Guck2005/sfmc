import { Bell, LogOut, User as UserIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/stores/auth-store'
import { authService } from '@/services/auth'
import { notificationsService } from '@/services'

function initials(s?: string) {
  if (!s) return '?'
  const parts = s.trim().split(/\s+/)
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?'
}

export function Topbar({ title }: { title?: string }) {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const navigate = useNavigate()

  const { data: pendingTotal = 0 } = useQuery({
    queryKey: ['notifications-pending-count'],
    queryFn: () => notificationsService.totalCount({ status: 'PENDING' }),
    enabled: !!token,
    refetchInterval: 60_000,
  })

  const handleLogout = async () => {
    await authService.logout()
    clearAuth()
    navigate('/login', { replace: true })
  }

  const displayName = user?.fullName || user?.email || ''

  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-4 lg:px-6">
      <h1 className="text-lg font-semibold">{title ?? 'SFMC'}</h1>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative" asChild>
          <Link to="/notifications" title="Notifications">
            <Bell className="h-5 w-5" />
            {pendingTotal > 0 ? (
              <Badge
                variant="destructive"
                className="absolute -right-1 -top-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center p-0"
              >
                {pendingTotal > 99 ? '99+' : pendingTotal}
              </Badge>
            ) : null}
          </Link>
        </Button>

        <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 px-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-sfmc-100 text-sfmc-800 text-xs">
                {initials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="hidden md:block text-left leading-tight">
              <div className="text-sm font-medium">{displayName || 'Utilisateur'}</div>
              <div className="text-xs text-muted-foreground">{user?.role}</div>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Mon compte</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/profile')}>
            <UserIcon className="mr-2 h-4 w-4" />
            Profil
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Se déconnecter
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
    </header>
  )
}
