import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, Package, Plus, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { productsService } from '@/services'
import { asArray } from '@/lib/pagination'
import { formatCurrency } from '@/lib/utils'
import { extractErrorMessage } from '@/lib/api'
import { DataTableEmpty } from '@/components/DataTableEmpty'
import { useAuthStore } from '@/stores/auth-store'
import type { Product } from '@/types/domain'

const productSchema = z.object({
  sku: z.string().min(2),
  name: z.string().min(2),
  category: z.string().optional(),
  description: z.string().optional(),
  unitPrice: z.coerce.number().min(0),
  currency: z.string().default('XOF'),
})
type ProductFormIn = z.input<typeof productSchema>
type ProductFormOut = z.output<typeof productSchema>

export default function ProductsPage() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const qc = useQueryClient()
  const canManage = useAuthStore((s) => s.hasRole('ADMIN'))

  const { data, isLoading } = useQuery({
    queryKey: ['products', q],
    queryFn: () => productsService.list({ limit: 100, q: q || undefined }),
  })

  const products = asArray<Product>(data)

  const form = useForm<ProductFormIn, unknown, ProductFormOut>({
    resolver: zodResolver(productSchema),
    defaultValues: { currency: 'XOF' },
  })

  const createMutation = useMutation({
    mutationFn: (payload: ProductFormOut) => productsService.create(payload),
    onSuccess: () => {
      toast.success('Produit créé')
      qc.invalidateQueries({ queryKey: ['products'] })
      setOpen(false)
      form.reset({ currency: 'XOF' })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Catalogue produits</CardTitle>
          <div className="mt-3 relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher…"
              className="pl-8 w-72"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1" />
                Nouveau produit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ajouter un produit</DialogTitle>
                <DialogDescription>Saisissez les informations du nouveau produit.</DialogDescription>
              </DialogHeader>
              <form
                onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>SKU</Label>
                    <Input {...form.register('sku')} placeholder="CEM-42.5" />
                  </div>
                  <div className="space-y-1">
                    <Label>Catégorie</Label>
                    <Input {...form.register('category')} placeholder="Ciment" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Nom</Label>
                  <Input {...form.register('name')} placeholder="Ciment CPA 42.5 - 50kg" />
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Input {...form.register('description')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Prix unitaire</Label>
                    <Input
                      type="number"
                      step="0.01"
                      {...form.register('unitPrice')}
                      placeholder="4500"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Devise</Label>
                    <Input {...form.register('currency')} placeholder="XOF" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Créer
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Chargement…</div>
        ) : products.length === 0 ? (
          <DataTableEmpty message="Aucun produit — créez-en un pour commencer." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead className="text-right">Prix unitaire</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{p.name}</span>
                    </div>
                    {p.description && (
                      <div className="text-xs text-muted-foreground">{p.description}</div>
                    )}
                  </TableCell>
                  <TableCell>{p.category ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(p.unitPrice, p.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.isActive ? 'success' : 'outline'}>
                      {p.isActive ? 'Actif' : 'Inactif'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
