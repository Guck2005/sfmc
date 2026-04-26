export function asArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const data = (payload as { data: unknown }).data
    if (Array.isArray(data)) return data as T[]
  }
  return []
}

/** Extrait `meta` d’une réponse liste paginée (Adonis / services internes). */
export function paginationMeta(payload: unknown): {
  total: number
  page: number
  lastPage: number
  perPage: number
} | null {
  if (!payload || typeof payload !== 'object' || !('meta' in payload)) return null
  const raw = (payload as { meta: Record<string, unknown> }).meta
  if (!raw || typeof raw !== 'object') return null
  const total = Number(raw.total)
  const lastPage = Number(raw.lastPage)
  const perPage = Number(raw.perPage)
  const page = Number(raw.currentPage ?? raw.page)
  if (!Number.isFinite(total) || !Number.isFinite(page) || !Number.isFinite(lastPage)) return null
  return {
    total,
    page: page < 1 ? 1 : page,
    lastPage: lastPage < 1 ? 1 : lastPage,
    perPage: Number.isFinite(perPage) && perPage > 0 ? perPage : 20,
  }
}
