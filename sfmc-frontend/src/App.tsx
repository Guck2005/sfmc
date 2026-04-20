import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'sonner'

import { AppShell } from '@/components/layout/AppShell'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import LoginPage from '@/pages/Login'
import DashboardPage from '@/pages/Dashboard'
import OrdersPage from '@/pages/Orders'
import OrderDetailPage from '@/pages/OrderDetail'
import ProductsPage from '@/pages/Products'
import InventoryPage from '@/pages/Inventory'
import ProductionPage from '@/pages/Production'
import BillingPage from '@/pages/Billing'
import NotificationsPage from '@/pages/Notifications'
import ReportsPage from '@/pages/Reports'
import UsersPage from '@/pages/Users'
import ProfilePage from '@/pages/Profile'
import NotFoundPage from '@/pages/NotFound'
import DesignShowcasePage from '@/pages/DesignShowcase'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/design-showcase" element={<DesignShowcasePage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="orders/:id" element={<OrderDetailPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="profile" element={<ProfilePage />} />

              {/* Espace CLIENT — aliases vers les mêmes pages, pages qui détectent
                  automatiquement le rôle et auto-filtrent sur l'utilisateur courant */}
              <Route element={<ProtectedRoute roles={['CLIENT']} />}>
                <Route path="my-orders" element={<OrdersPage />} />
                <Route path="my-invoices" element={<BillingPage />} />
              </Route>

              {/* Sections internes — interdites aux CLIENT */}
              <Route element={<ProtectedRoute roles={['ADMIN', 'OPERATOR']} />}>
                <Route path="orders" element={<OrdersPage />} />
                <Route path="inventory" element={<InventoryPage />} />
                <Route path="billing" element={<BillingPage />} />
                <Route path="production" element={<ProductionPage />} />
                <Route path="reports" element={<ReportsPage />} />
              </Route>

              <Route element={<ProtectedRoute roles={['ADMIN']} />}>
                <Route path="users" element={<UsersPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
          <Route path="404" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors closeButton />
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
    </QueryClientProvider>
  )
}
