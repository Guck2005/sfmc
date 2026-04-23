import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { productsService } from '@/services'
import { asArray } from '@/lib/pagination'
import type { Product } from '@/types/domain'

const DEFAULT_LIMIT = 200

/**
 * Charge le catalogue (pagination simple) pour afficher un libellé à partir de `productId`.
 * Les API métier continuent d’exposer des UUID ; l’enrichissement est volontairement côté UI.
 */
export function useProductNameMap(options?: { enabled?: boolean; limit?: number }) {
  const limit = options?.limit ?? DEFAULT_LIMIT
  const enabled = options?.enabled ?? true

  const query = useQuery({
    queryKey: ['products', 'catalog', limit],
    queryFn: () => productsService.list({ page: 1, limit }),
    enabled,
  })

  const products = useMemo(() => asArray<Product>(query.data), [query.data])

  const nameById = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p.name])) as Record<string, string>,
    [products]
  )

  function productLabel(id: string | null | undefined, fallback = 'Produit (hors catalogue)') {
    if (!id) return fallback
    return nameById[id] ?? fallback
  }

  return { ...query, products, nameById, productLabel }
}
