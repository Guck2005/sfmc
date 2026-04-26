import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { postAuthRefresh } from '@/lib/auth-refresh'

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
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string; error?: string | Record<string, unknown> }>) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _authRetry?: boolean }) | undefined
    const status = error.response?.status

    const message =
      (typeof error.response?.data?.message === 'string' ? error.response.data.message : undefined) ||
      (typeof error.response?.data?.error === 'string' ? error.response.data.error : undefined) ||
      error.message ||
      'Erreur inconnue'

    if (status === 401 && originalRequest && !originalRequest._authRetry) {
      const path = originalRequest.url || ''
      const isLoginOrRegister = path.includes('auth/login') || path.includes('auth/register')

      if (!isLoginOrRegister) {
        const { refreshToken, user } = useAuthStore.getState()
        if (refreshToken && user) {
          originalRequest._authRetry = true
          try {
            const next = await postAuthRefresh(refreshToken)
            useAuthStore.getState().setAuth({
              token: next.accessToken,
              refreshToken: next.refreshToken,
            })
            originalRequest.headers.Authorization = `Bearer ${next.accessToken}`
            return api.request(originalRequest)
          } catch {
            const { clearAuth, token } = useAuthStore.getState()
            if (token) {
              clearAuth()
              toast.error('Session expirée, veuillez vous reconnecter.')
              if (!window.location.pathname.startsWith('/login')) {
                window.location.href = '/login'
              }
            }
            return Promise.reject(error)
          }
        }
      }

      const { clearAuth, token } = useAuthStore.getState()
      if (token) {
        clearAuth()
        toast.error('Session expirée, veuillez vous reconnecter.')
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login'
        }
      }
      return Promise.reject(error)
    }

    if (status === 403) {
      toast.error("Action non autorisée (droits insuffisants).")
    } else if (status === 409) {
      toast.error(`Conflit (409) : ${message}`)
    } else if (status === 429) {
      toast.error('Trop de requêtes, veuillez patienter.')
    } else if (status === 503) {
      toast.error(`Service indisponible (503) : ${message}`)
    } else if (status && status >= 500) {
      toast.error(`Erreur serveur (${status}) : ${message}`)
    }

    return Promise.reject(error)
  }
)

export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as Record<string, unknown> | undefined
    const errBody =
      data?.error && typeof data.error === 'object' && data.error !== null
        ? (data.error as { message?: string; code?: string; details?: { requested?: number; available?: number } })
        : null
    if (errBody && typeof errBody.message === 'string') {
      const { message, code, details } = errBody
      if (
        code === 'INSUFFICIENT_STOCK' &&
        details &&
        typeof details.available === 'number' &&
        typeof details.requested === 'number' &&
        !message.includes(String(details.available))
      ) {
        return `${message} (disponible : ${details.available}, demandé : ${details.requested}).`
      }
      return message
    }

    const vine = data?.errors
    if (Array.isArray(vine) && vine.length > 0) {
      const parts = vine
        .map((e) => {
          if (e && typeof e === 'object' && 'message' in e) {
            const field = 'field' in e && typeof (e as { field?: string }).field === 'string'
              ? `${(e as { field: string }).field}: `
              : ''
            return `${field}${String((e as { message?: string }).message ?? '')}`
          }
          return null
        })
        .filter(Boolean)
      if (parts.length) return parts.join(' · ')
    }

    return (
      (typeof data?.message === 'string' ? data.message : undefined) ||
      (typeof data?.error === 'string' ? data.error : undefined) ||
      err.message ||
      'Erreur inconnue'
    )
  }
  return err instanceof Error ? err.message : 'Erreur inconnue'
}
