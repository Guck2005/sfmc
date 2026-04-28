import { useEffect } from "react"
import { useNavigate, Navigate } from 'react-router-dom'
import { jwtDecode, type JwtPayload } from "jwt-decode"
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { extractErrorMessage } from '@/lib/api'

export default function AuthSuccess() {
  const navigate = useNavigate()
 
  const setAuth = useAuthStore((s) => s.setAuth)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  if (isAuthenticated()) return <Navigate to="/" replace />

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)

      const accessToken = params.get("accessToken")
      const refreshToken = params.get("refreshToken")

      if (!accessToken) {
        throw new Error("Token manquant")
      }

      const payload = jwtDecode<JwtPayload>(accessToken)

      const role = params.get("role")

      const user = {
        id: params.get("id") ?? payload.sub,
        email: params.get("email") ?? payload?.email,
        role: params.get("role") ?? payload?.role,
      }

      setAuth({
        token: accessToken,
        refreshToken,
        user,
      })

      toast.success('Connexion réussie')
      navigate(role === 'CLIENT' ? '/my-orders' : '/', { replace: true })
    } catch (err) {
      toast.error(extractErrorMessage(err))
      navigate("/login")
    }
  }, [])

  return <p className="text-center text-2xl text-slate-900">Connexion en cours...</p>
}