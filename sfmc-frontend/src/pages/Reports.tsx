import DashboardPage from './Dashboard'

/** Route dédiée : analyses détaillées + exports (voir `pageMode="reports"` dans `Dashboard.tsx`). */
export default function ReportsPage() {
  return <DashboardPage pageMode="reports" />
}
