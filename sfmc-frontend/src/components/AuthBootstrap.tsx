import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { authService } from '@/services/auth'

/**
 * Au chargement : vérifie que le JWT en session est toujours accepté par auth-service.
 * Ne bloque pas le rendu ; en cas d’échec, purge silencieuse (401 géré par l’intercepteur).
 */
export function AuthBootstrap() {
  const token = useAuthStore((s) => s.token)
  const ran = useRef(false)

  useEffect(() => {
    if (!token || ran.current) return
    ran.current = true
    void authService.validate().catch(() => {
      ran.current = false
    })
  }, [token])

  return null
}
