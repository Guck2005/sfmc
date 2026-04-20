import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { jwtDecode } from 'jwt-decode'
import type { AuthUser, JwtPayload, UserRole } from '@/types/auth'

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: AuthUser | null
  setAuth: (payload: { token: string; refreshToken?: string; user: AuthUser }) => void
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
      setAuth: ({ token, refreshToken, user }) => {
        set({ token, refreshToken: refreshToken ?? null, user })
      },
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
