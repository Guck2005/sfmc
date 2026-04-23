import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inventoryService } from '@/services'
import { extractErrorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

export default function InventoryToolsPage() {
  const qc = useQueryClient()
  const canUseSagaTools = useAuthStore((s) => s.hasRole('ADMIN', 'OPERATOR'))

  const [checkProductId, setCheckProductId] = useState('')
  const [checkQty, setCheckQty] = useState('1')
  const [reserveOrderId, setReserveOrderId] = useState('')
  const [reserveLinesJson, setReserveLinesJson] = useState(
    '[\n  { "productId": "00000000-0000-4000-8000-000000000001", "quantity": 1 }\n]'
  )
  const [releaseOrderId, setReleaseOrderId] = useState('')
  const [releaseLinesJson, setReleaseLinesJson] = useState(
    '[\n  { "productId": "00000000-0000-4000-8000-000000000001", "quantity": 1 }\n]'
  )

  const checkMutation = useMutation({
    mutationFn: () => {
      const pid = checkProductId.trim()
      if (!z.string().uuid().safeParse(pid).success) throw new Error('productId : UUID invalide')
      const q = Number(checkQty)
      if (!Number.isFinite(q) || q <= 0) throw new Error('Quantité invalide')
      return inventoryService.checkAvailability({ productId: pid, quantity: q })
    },
    onSuccess: (d) => {
      toast.success(
        d.available
          ? `Disponible : ${d.currentStock} ≥ demande (produit ${d.productId.slice(0, 8)}…)`
          : `Insuffisant : ${d.currentStock} < ${checkQty} demandé(s)`
      )
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const reserveMutation = useMutation({
    mutationFn: () => {
      let lines: { productId: string; quantity: number }[]
      try {
        lines = JSON.parse(reserveLinesJson) as { productId: string; quantity: number }[]
      } catch {
        throw new Error('JSON des lignes invalide')
      }
      if (!Array.isArray(lines) || lines.length === 0) throw new Error('Au moins une ligne requise')
      const oid = reserveOrderId.trim()
      if (!z.string().uuid().safeParse(oid).success) throw new Error('orderId : UUID invalide')
      return inventoryService.reserve({ orderId: oid, lines })
    },
    onSuccess: () => {
      toast.success('Réservation appliquée')
      qc.invalidateQueries({ queryKey: ['stocks'] })
      qc.invalidateQueries({ queryKey: ['stock-movements'] })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const releaseMutation = useMutation({
    mutationFn: () => {
      let lines: { productId: string; quantity: number }[]
      try {
        lines = JSON.parse(releaseLinesJson) as { productId: string; quantity: number }[]
      } catch {
        throw new Error('JSON des lignes invalide')
      }
      if (!Array.isArray(lines) || lines.length === 0) throw new Error('Au moins une ligne requise')
      const oid = releaseOrderId.trim()
      if (!z.string().uuid().safeParse(oid).success) throw new Error('orderId : UUID invalide')
      return inventoryService.release({ orderId: oid, lines })
    },
    onSuccess: () => {
      toast.success('Libération appliquée')
      qc.invalidateQueries({ queryKey: ['stocks'] })
      qc.invalidateQueries({ queryKey: ['stock-movements'] })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Outils saga / disponibilité</CardTitle>
        <CardDescription>
          Réservation et libération manuelles, vérification de stock — usage opérationnel prudent.
        </CardDescription>
      </CardHeader>
      {canUseSagaTools ? (
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2 rounded-lg border p-4">
              <h4 className="text-sm font-medium">Vérifier disponibilité</h4>
              <Label className="text-xs">Identifiant produit</Label>
              <Input
                className="font-mono text-xs"
                value={checkProductId}
                onChange={(e) => setCheckProductId(e.target.value)}
                placeholder="Identifiant catalogue"
              />
              <Label className="text-xs">Quantité demandée</Label>
              <Input value={checkQty} onChange={(e) => setCheckQty(e.target.value)} type="number" min={1} />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={checkMutation.isPending}
                onClick={() => checkMutation.mutate()}
              >
                {checkMutation.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Vérifier
              </Button>
            </div>
            <div className="space-y-2 rounded-lg border p-4 md:col-span-2">
              <h4 className="text-sm font-medium">Réserver pour une commande</h4>
              <p className="text-xs text-muted-foreground">
                Tableau JSON de lignes : identifiant produit et quantité pour chaque ligne.
              </p>
              <Label className="text-xs">Identifiant commande</Label>
              <Input
                className="font-mono text-xs"
                value={reserveOrderId}
                onChange={(e) => setReserveOrderId(e.target.value)}
              />
              <Label className="text-xs">Lignes (JSON)</Label>
              <textarea
                className={cn(
                  'flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
                )}
                value={reserveLinesJson}
                onChange={(e) => setReserveLinesJson(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                disabled={reserveMutation.isPending}
                onClick={() => reserveMutation.mutate()}
              >
                {reserveMutation.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Réserver
              </Button>
            </div>
          </div>
          <div className="space-y-2 rounded-lg border p-4">
            <h4 className="text-sm font-medium">Libérer une réservation</h4>
            <p className="text-xs text-muted-foreground">
              Même format de lignes JSON que pour la réservation.
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <Label className="text-xs">Identifiant commande</Label>
                <Input
                  className="font-mono text-xs"
                  value={releaseOrderId}
                  onChange={(e) => setReleaseOrderId(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Lignes (JSON)</Label>
                <textarea
                  className={cn(
                    'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                  )}
                  value={releaseLinesJson}
                  onChange={(e) => setReleaseLinesJson(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={releaseMutation.isPending}
              onClick={() => releaseMutation.mutate()}
            >
              {releaseMutation.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Libérer
            </Button>
          </div>
        </CardContent>
      ) : (
        <CardContent className="text-sm text-muted-foreground">Réservé aux rôles internes.</CardContent>
      )}
    </Card>
  )
}
