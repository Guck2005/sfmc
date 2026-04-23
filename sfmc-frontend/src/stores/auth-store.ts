import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { jwtDecode } from 'jwt-decode'
import type { AuthUser, JwtPayload, UserRole } from '@/types/auth'

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: AuthUser | null
  /** Met à jour le jeton (refresh) ou la session complète (login). Champs absents = conservés. */
  setAuth: (payload: { token?: string; refreshToken?: string | null; user?: AuthUser | null }) => void
  clearAuth: () => void
  isAuthenticated: () => boolean
  hasRole: (...roles: UserRole[]) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      setAuth: (payload) =>
        set((s) => ({
          token: payload.token !== undefined ? payload.token : s.token,
          refreshToken:
            payload.refreshToken !== undefined ? payload.refreshToken : s.refreshToken,
          user: payload.user !== undefined ? payload.user : s.user,
        })),
      clearAuth: () => set({ token: null, refreshToken: null, user: null }),
      isAuthenticated: () => {
        const token = get().token
        if (!token || typeof token !== 'string') return false
        try {
          const payload = jwtDecode<JwtPayload>(token)
          if (!payload?.exp) return true
          return payload.exp * 1000 > Date.now()
        } catch {
          return false
        }
      },
      hasRole: (...roles: UserRole[]) => {
        const user = get().user
        return !!user && roles.includes(user.role)
      },
    }),
    {
      name: 'sfmc-auth',
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    }
  )
)
