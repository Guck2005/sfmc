import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'sonner'

import { AppShell } from '@/components/layout/AppShell'
import { AuthBootstrap } from '@/components/AuthBootstrap'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import LoginPage from '@/pages/Login'
import HomePage from '@/pages/HomePage'
import OrdersPage from '@/pages/Orders'
import OrderDetailPage from '@/pages/OrderDetail'
import ProductsPage from '@/pages/Products'
import InventoryLayout from '@/pages/inventory/InventoryLayout'
import InventoryOverviewPage from '@/pages/inventory/InventoryOverviewPage'
import InventoryWarehousesPage from '@/pages/inventory/InventoryWarehousesPage'
import InventoryStockLinesPage from '@/pages/inventory/InventoryStockLinesPage'
import InventoryMovementsPage from '@/pages/inventory/InventoryMovementsPage'
import PendingReceptionsPage from '@/pages/inventory/PendingReceptionsPage'
import InventoryToolsPage from '@/pages/inventory/InventoryToolsPage'
import InventoryGraphqlPage from '@/pages/inventory/InventoryGraphqlPage'
import ProductionLayout from '@/pages/production/ProductionLayout'
import ProductionOrdersPage from '@/pages/production/ProductionOrdersPage'
import ProductionMachinesPage from '@/pages/production/ProductionMachinesPage'
import ProductionMachineDetailPage from '@/pages/production/ProductionMachineDetailPage'
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
        <AuthBootstrap />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/design-showcase" element={<DesignShowcasePage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="orders/:id" element={<OrderDetailPage />} />
              <Route path="products/:productId" element={<ProductsPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="profile" element={<ProfilePage />} />

              {/* Espace CLIENT — aliases vers les mêmes pages, pages qui détectent
                  automatiquement le rôle et auto-filtrent sur l'utilisateur courant */}
              <Route element={<ProtectedRoute roles={['CLIENT']} />}>
                <Route path="my-orders" element={<OrdersPage />} />
                <Route path="my-invoices/:invoiceId" element={<BillingPage />} />
                <Route path="my-invoices" element={<BillingPage />} />
              </Route>

              {/* Sections internes — interdites aux CLIENT */}
              <Route element={<ProtectedRoute roles={['ADMIN', 'OPERATOR']} />}>
                <Route path="orders" element={<OrdersPage />} />
                <Route path="inventory" element={<InventoryLayout />}>
                  <Route index element={<Navigate to="overview" replace />} />
                  <Route path="overview" element={<InventoryOverviewPage />} />
                  <Route path="warehouses" element={<InventoryWarehousesPage />} />
                  <Route path="stock-lines" element={<InventoryStockLinesPage />} />
                  <Route path="movements" element={<InventoryMovementsPage />} />
                  <Route path="pending-receptions" element={<PendingReceptionsPage />} />
                  <Route path="tools" element={<InventoryToolsPage />} />
                  <Route path="graphql" element={<InventoryGraphqlPage />} />
                </Route>
                <Route path="billing/:invoiceId" element={<BillingPage />} />
                <Route path="billing" element={<BillingPage />} />
                <Route path="production" element={<ProductionLayout />}>
                  <Route index element={<Navigate to="orders" replace />} />
                  <Route path="orders" element={<ProductionOrdersPage />} />
                  <Route path="machines/:machineId" element={<ProductionMachineDetailPage />} />
                  <Route path="machines" element={<ProductionMachinesPage />} />
                </Route>
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
