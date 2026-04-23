import { api } from '@/lib/api'
import { postAuthRefresh } from '@/lib/auth-refresh'
import { useAuthStore } from '@/stores/auth-store'
import type { LoginApiEnvelope, LoginPayload, LoginResponse } from '@/types/auth'

export const authService = {
  async login(payload: LoginPayload): Promise<LoginResponse> {
    const { data } = await api.post<LoginApiEnvelope>('/auth/login', payload)
    return data.data
  },

  async logout() {
    const refreshToken = useAuthStore.getState().refreshToken
    try {
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken })
      }
    } catch {
      /* noop: best-effort */
    }
  },

  async validate() {
    const { data } = await api.post<{
      data: { valid: boolean; userId: string; email: string; role: string }
    }>('/auth/validate', {})
    return data.data
  },

  async refresh(refreshToken: string) {
    return postAuthRefresh(refreshToken)
  },
}
