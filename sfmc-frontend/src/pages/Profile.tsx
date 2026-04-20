import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth-store'

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)

  if (!user) return null

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Profil utilisateur</CardTitle>
        <CardDescription>Informations de votre compte SFMC.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Identifiant</span>
          <span className="font-mono text-xs">{user.id}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Email</span>
          <span className="font-medium">{user.email}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Nom complet</span>
          <span>{user.fullName ?? '—'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Rôle</span>
          <Badge>{user.role}</Badge>
        </div>
      </CardContent>
    </Card>
  )
}
