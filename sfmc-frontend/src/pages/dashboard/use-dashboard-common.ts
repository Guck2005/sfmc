import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

import { getWsClient } from '@/lib/graphql'
import { useAuthStore } from '@/stores/auth-store'
import { reportingService } from '@/services'

import { KPI_SUBSCRIPTION, STATUS_LABELS, periodHint } from './constants'

export function useDashboardCommon() {
  const role = useAuthStore((s) => s.user?.role)
  const isClient = role === 'CLIENT'

  /** Filtre effectif (comme `/orders` : changement de date = requête immédiate). */
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'live' | 'offline'>('connecting')
  const [wsDegraded, setWsDegraded] = useState(false)

  const rangeParams =
    from || to
      ? {
          from: from || undefined,
          to: to || undefined,
        }
      : undefined

  const { data: kpis, isLoading, refetch, error, isFetching } = useQuery({
    queryKey: ['reports', 'dashboard', from, to, role],
    queryFn: () => reportingService.dashboard(rangeParams),
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (isClient) {
      setLiveStatus('offline')
      return
    }
    const client = getWsClient()
    const unsubscribe = client.subscribe(
      { query: KPI_SUBSCRIPTION },
      {
        next: () => {
          setLiveStatus('live')
          setWsDegraded(false)
          refetch()
        },
        error: () => {
          setLiveStatus('offline')
          setWsDegraded(true)
        },
        complete: () => {
          setLiveStatus('offline')
          setWsDegraded(true)
        },
      }
    )
    const t = setTimeout(() => setLiveStatus((s) => (s === 'connecting' ? 'offline' : s)), 4000)
    return () => {
      clearTimeout(t)
      unsubscribe()
    }
  }, [isClient, refetch])

  const ordersByStatus = useMemo(
    () =>
      kpis?.ordersByStatus?.map((row) => ({
        label: STATUS_LABELS[row.status] ?? row.status,
        count: row.count,
      })) ?? [],
    [kpis?.ordersByStatus]
  )

  const pendingProduction = (kpis?.totalOrders ?? 0) - (kpis?.productionCompleted ?? 0)
  const periodLabel = periodHint(from, to)
  const is503 = isAxiosError(error) && error.response?.status === 503

  const value = {
    isClient,
    from,
    to,
    setFrom,
    setTo,
    rangeParams,
    kpis,
    isLoading,
    refetch,
    error,
    isFetching,
    liveStatus,
    wsDegraded,
    ordersByStatus,
    pendingProduction,
    periodLabel,
    is503,
  }
  return value
}

export type DashboardCommonState = ReturnType<typeof useDashboardCommon>
