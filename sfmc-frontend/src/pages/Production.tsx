import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ClipboardCheck, Loader2, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { productionService, productsService } from '@/services'
import { asArray } from '@/lib/pagination'
import { formatDateTime } from '@/lib/utils'
import { extractErrorMessage } from '@/lib/api'
import { DataTableEmpty } from '@/components/DataTableEmpty'
import { useAuthStore } from '@/stores/auth-store'
import type { Product, ProductionOrder, ProductionStatus } from '@/types/domain'

const STATUS_COLORS: Record<ProductionStatus, 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive'> = {
  PLANNED: 'outline',
  IN_PROGRESS: 'warning',
  QUALITY_CHECK: 'secondary',
  COMPLETED: 'success',
  FAILED: 'destructive',
}

const schema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1),
  orderId: z.string().optional(),
})
type FormIn = z.input<typeof schema>
type FormOut = z.output<typeof schema>

const qualitySchema = z.object({
  qualityScore: z.coerce.number().min(0).max(100),
  passed: z.boolean(),
  notes: z.string().optional(),
})
type QualityFormIn = z.input<typeof qualitySchema>
type QualityFormOut = z.output<typeof qualitySchema>

export default function ProductionPage() {
  const [open, setOpen] = useState(false)
  const [qualityOrder, setQualityOrder] = useState<ProductionOrder | null>(null)
  const qc = useQueryClient()
  const canQA = useAuthStore((s) => s.hasRole('ADMIN', 'OPERATOR'))

  const { data, isLoading } = useQuery({
    queryKey: ['production-orders'],
    queryFn: () => productionService.list(),
    refetchInterval: 15_000,
  })

  const { data: productsData } = useQuery({
    queryKey: ['products-lite'],
    queryFn: () => productsService.list({ limit: 200 }),
  })

  const orders = asArray<ProductionOrder>(data)
  const products = asArray<Product>(productsData)

  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(schema) })

  const createMutation = useMutation({
    mutationFn: (payload: FormOut) => productionService.create(payload),
    onSuccess: () => {
      toast.success('Ordre de production créé')
      qc.invalidateQueries({ queryKey: ['production-orders'] })
      setOpen(false)
      form.reset()
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const qualityForm = useForm<QualityFormIn, unknown, QualityFormOut>({
    resolver: zodResolver(qualitySchema),
    defaultValues: { passed: true, qualityScore: 95 },
  })

  const qaMutation = useMutation({
    mutationFn: (payload: { id: string; data: QualityFormOut }) =>
      productionService.qualityControl(payload.id, payload.data),
    onSuccess: () => {
      toast.success('Contrôle qualité enregistré')
      qc.invalidateQueries({ queryKey: ['production-orders'] })
      setQualityOrder(null)
      qualityForm.reset({ passed: true, qualityScore: 95 })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Ordres de production</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              Nouveau
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvel ordre de production</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
              className="space-y-4"
            >
              <div className="space-y-1">
                <Label>Produit</Label>
                <Select
                  value={form.watch('productId')}
                  onValueChange={(v) => form.setValue('productId', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir…" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Quantité</Label>
                <Input type="number" min={1} {...form.register('quantity')} />
              </div>
              <div className="space-y-1">
                <Label>Commande associée (optionnel)</Label>
                <Input {...form.register('orderId')} placeholder="UUID commande" />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Créer
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Chargement…</div>
        ) : orders.length === 0 ? (
          <DataTableEmpty message="Aucun ordre de production" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Produit</TableHead>
                <TableHead className="text-right">Qté</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Qualité</TableHead>
                <TableHead>Démarré</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.id.slice(0, 8)}</TableCell>
                  <TableCell className="font-mono text-xs">{o.productId.slice(0, 8)}</TableCell>
                  <TableCell className="text-right font-mono">{o.quantity}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[o.status]}>{o.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {o.qualityScore != null ? `${o.qualityScore}/100` : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {o.startedAt ? formatDateTime(o.startedAt) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {canQA && (o.status === 'IN_PROGRESS' || o.status === 'QUALITY_CHECK') && (
                      <Button variant="ghost" size="sm" onClick={() => setQualityOrder(o)}>
                        <ClipboardCheck className="h-4 w-4 mr-1" />
                        QA
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!qualityOrder} onOpenChange={(v) => !v && setQualityOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contrôle qualité</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={qualityForm.handleSubmit((v) =>
              qualityOrder && qaMutation.mutate({ id: qualityOrder.id, data: v })
            )}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>Score qualité (0-100)</Label>
              <Input type="number" min={0} max={100} {...qualityForm.register('qualityScore')} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="passed"
                {...qualityForm.register('passed')}
                className="h-4 w-4"
              />
              <Label htmlFor="passed" className="cursor-pointer">
                Lot validé
              </Label>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Input {...qualityForm.register('notes')} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={qaMutation.isPending}>
                {qaMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Valider
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
