import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { jwtDecode } from 'jwt-decode'
import { Eye, EyeOff, Factory, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/auth-store'
import { authService } from '@/services/auth'
import { extractErrorMessage } from '@/lib/api'
import type { JwtPayload } from '@/types/auth'

const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  if (isAuthenticated()) return <Navigate to="/" replace />

  const onSubmit = async (values: LoginForm) => {
    setLoading(true)
    try {
      const res = await authService.login(values)
      const payload = jwtDecode<JwtPayload>(res.accessToken)
      const role = res.user?.role ?? payload.role
      setAuth({
        token: res.accessToken,
        refreshToken: res.refreshToken,
        user: {
          id: res.user?.id ?? payload.sub,
          email: res.user?.email ?? payload.email ?? values.email,
          role,
        },
      })
      toast.success('Connexion réussie')
      navigate(role === 'CLIENT' ? '/my-orders' : '/', { replace: true })
    } catch (err) {
      toast.error(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-sfmc-700 via-sfmc-600 to-sfmc-500 p-10 text-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/15 rounded-lg">
            <Factory className="h-7 w-7" />
          </div>
          <span className="text-xl font-semibold">SFMC Bénin</span>
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-bold leading-tight">
            Plateforme de gestion
            <br />
            industrielle
          </h1>
          <p className="text-white/85 max-w-md">
            Pilotez commandes, production, stocks et facturation pour toute la chaîne
            manufacturière SFMC depuis un tableau de bord unifié.
          </p>
          <ul className="text-sm text-white/85 space-y-1.5 pt-2">
            <li>• Chaîne complète : commandes, stocks, production, facturation</li>
            <li>• Données synchronisées entre les équipes commerciales et atelier</li>
            <li>• Tableaux de bord et alertes actualisés en temps réel</li>
          </ul>
        </div>
        <div className="text-xs text-white/60">
          © {new Date().getFullYear()} Société Foutougué de Matériaux de Construction
        </div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-10">
        <Card className="w-full max-w-md border-0 shadow-none lg:border lg:shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle>Connexion</CardTitle>
            <CardDescription>
              Entrez vos identifiants pour accéder au back-office SFMC.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="vous@sfmc.bj"
                  autoComplete="username"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Se connecter
              </Button>
            </form>

            <p className="text-xs text-muted-foreground mt-6 text-center">
              Ce service est protégé par rate limiting (5 tentatives / 15 min).
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
