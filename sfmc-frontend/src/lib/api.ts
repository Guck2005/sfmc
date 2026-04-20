import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

export const api = axios.create({
  baseURL: '/api/v1',
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string; error?: string }>) => {
    const status = error.response?.status
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'Erreur inconnue'

    if (status === 401) {
      const { clearAuth, token } = useAuthStore.getState()
      if (token) {
        clearAuth()
        toast.error('Session expirée, veuillez vous reconnecter.')
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login'
        }
      }
    } else if (status === 403) {
      toast.error("Action non autorisée (droits insuffisants).")
    } else if (status === 429) {
      toast.error('Trop de requêtes, veuillez patienter.')
    } else if (status && status >= 500) {
      toast.error(`Erreur serveur (${status}) : ${message}`)
    }

    return Promise.reject(error)
  }
)

export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (
      err.response?.data?.message ||
      err.response?.data?.error ||
      err.message ||
      'Erreur inconnue'
    )
  }
  return err instanceof Error ? err.message : 'Erreur inconnue'
}
