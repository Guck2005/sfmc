import { useQuery } from '@tanstack/react-query'
import { useProductNameMap } from '@/hooks/use-product-name-map'
import { isKnownCatalogProductId } from '@/lib/catalog'
import { Loader2 } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { inventoryGraphql } from '@/services'
import { extractErrorMessage } from '@/lib/api'
import type { CriticalStockGqlRow } from '@/types/domain'

export default function InventoryGraphqlPage() {
  const { productLabel, nameById } = useProductNameMap({ limit: 200 })

  const gqlCriticalQuery = useQuery({
    queryKey: ['inventory-graphql-critical'],
    queryFn: () => inventoryGraphql.criticalStocks(),
    enabled: false,
  })

  const gqlRows: CriticalStockGqlRow[] = gqlCriticalQuery.data?.criticalStocks ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Stocks critiques (lecture avancée)</CardTitle>
        <CardDescription>
          Liste des stocks sous le seuil d’alerte, chargée sur demande pour les diagnostics.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={gqlCriticalQuery.isFetching}
          onClick={() => gqlCriticalQuery.refetch()}
        >
          {gqlCriticalQuery.isFetching && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          Charger les stocks critiques
        </Button>
        {gqlCriticalQuery.isError && (
          <p className="text-sm text-destructive">{extractErrorMessage(gqlCriticalQuery.error)}</p>
        )}
        {gqlRows.length > 0 && (
          <div className="max-h-[280px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produit</TableHead>
                  <TableHead>Entrepôt</TableHead>
                  <TableHead className="text-right">Dispo</TableHead>
                  <TableHead className="text-right">Seuil</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gqlRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[min(100vw,18rem)]">
                      <div className="font-medium text-sm leading-tight">{productLabel(r.productId)}</div>
                      {!isKnownCatalogProductId(nameById, r.productId) && (
                        <div className="truncate font-mono text-[11px] text-muted-foreground" title={r.productId}>
                          {r.productId}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{r.warehouse?.name ?? r.warehouseId}</TableCell>
                    <TableCell className="text-right font-mono">{r.available}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {r.threshold}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
