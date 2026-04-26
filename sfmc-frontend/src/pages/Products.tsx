import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, Package, Pencil, Plus, Search, Trash2, Braces } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { RowActionsMenu } from '@/components/RowActionsMenu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { productGraphql, productsService } from '@/services'
import { asArray } from '@/lib/pagination'
import { formatCurrency } from '@/lib/utils'
import { extractErrorMessage } from '@/lib/api'
import { DataTableEmpty } from '@/components/DataTableEmpty'
import { useAuthStore } from '@/stores/auth-store'
import type { Product, ProductCategory } from '@/types/domain'

const CATEGORIES: ProductCategory[] = ['CIMENT', 'FER', 'BRIQUES', 'GRANULATS']

function ProductTableThumb({ imageUrl }: { imageUrl?: string | null }) {
  const [broken, setBroken] = useState(false)
  const src = imageUrl?.trim()
  if (!src || broken) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted">
        <Package className="h-4 w-4 text-muted-foreground" />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt=""
      className="h-10 w-10 rounded-md border object-cover bg-muted"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  )
}

const productSchema = z.object({
  name: z.string().min(2),
  category: z.enum(['CIMENT', 'FER', 'BRIQUES', 'GRANULATS']),
  unit: z.string().min(1),
  description: z.string().optional(),
  imageUrl: z
    .string()
    .max(2048)
    .optional()
    .transform((s) => (s?.trim() ? s.trim() : undefined))
    .refine(
      (s) =>
        s === undefined ||
        /^https?:\/\/.+/i.test(s) ||
        /^\/api\/v1\/products\/assets\/[0-9a-f-]{36}\.(jpg|jpeg|png|gif|webp)$/i.test(s),
      { message: 'URL https://…, chemin /api/v1/products/assets/…, ou laisser vide' }
    ),
  unitPrice: z.coerce.number().positive(),
})
type ProductFormOut = z.output<typeof productSchema>

const editProductSchema = productSchema.extend({
  isActive: z.boolean(),
})
type EditProductFormOut = z.output<typeof editProductSchema>

export default function ProductsPage() {
  const { productId } = useParams()
  const navigate = useNavigate()
  const detailId = productId ?? null

  const [open, setOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [q, setQ] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('__all__')
  const [activeFilter, setActiveFilter] = useState<string>('__all__')
  const [gqlPreview, setGqlPreview] = useState<string | null>(null)
  const createImageFileRef = useRef<HTMLInputElement>(null)
  const editImageFileRef = useRef<HTMLInputElement>(null)

  const qc = useQueryClient()
  const canManage = useAuthStore((s) => s.hasRole('ADMIN'))

  const listParams = {
    limit: 100 as const,
    q: q || undefined,
    ...(categoryFilter !== '__all__' ? { category: categoryFilter } : {}),
    ...(activeFilter === 'active' ? { isActive: 'true' as const } : {}),
    ...(activeFilter === 'inactive' ? { isActive: 'false' as const } : {}),
  }

  const { data, isLoading } = useQuery({
    queryKey: ['products', listParams],
    queryFn: () => productsService.list(listParams),
  })

  const { data: detailProduct, isFetching: loadingDetail } = useQuery({
    queryKey: ['product', detailId],
    queryFn: () => productsService.get(detailId!),
    enabled: !!detailId,
  })

  const products = asArray<Product>(data)

  const form = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: { category: 'CIMENT', unit: 'unité', imageUrl: '' },
  })

  const editForm = useForm({
    resolver: zodResolver(editProductSchema),
  })

  const createMutation = useMutation({
    mutationFn: (payload: ProductFormOut) => productsService.create(payload),
    onSuccess: () => {
      toast.success('Produit créé')
      qc.invalidateQueries({ queryKey: ['products'] })
      setOpen(false)
      form.reset({ category: 'CIMENT', unit: 'unité', imageUrl: '' })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; body: EditProductFormOut }) =>
      productsService.update(payload.id, payload.body),
    onSuccess: () => {
      toast.success('Produit mis à jour')
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['product'] })
      setEditProduct(null)
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => productsService.remove(id),
    onSuccess: () => {
      toast.success('Produit désactivé')
      qc.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const uploadImageForCreate = useMutation({
    mutationFn: (file: File) => productsService.uploadProductImage(file),
    onSuccess: (d) => {
      form.setValue('imageUrl', d.url, { shouldValidate: true, shouldDirty: true })
      toast.success('Image téléversée')
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const uploadImageForEdit = useMutation({
    mutationFn: (file: File) => productsService.uploadProductImage(file),
    onSuccess: (d) => {
      editForm.setValue('imageUrl', d.url, { shouldValidate: true, shouldDirty: true })
      toast.success('Image téléversée')
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const loadGraphql = async () => {
    try {
      const res = await productGraphql.products()
      setGqlPreview(JSON.stringify(res.products?.slice(0, 5) ?? [], null, 2))
      toast.success(`${res.products?.length ?? 0} produit(s) chargé(s) (aperçu).`)
    } catch (e) {
      toast.error(extractErrorMessage(e))
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-1.5">
              <CardTitle>Catalogue produits</CardTitle>
              <CardDescription>
                Gérez le catalogue matériaux : prix, unités et catégories. La création et la modification sont
                réservées aux administrateurs.
              </CardDescription>
            </div>
            {canManage && (
              <div className="shrink-0">
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
                      <DialogDescription>Renseignez les informations du nouveau produit (réservé aux administrateurs).</DialogDescription>
                    </DialogHeader>
                    <form
                      onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
                      className="space-y-4"
                    >
                      <div className="space-y-1">
                        <Label>Nom</Label>
                        <Input {...form.register('name')} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label>Catégorie</Label>
                          <Select
                            value={form.watch('category')}
                            onValueChange={(v) => form.setValue('category', v as ProductCategory)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.map((c) => (
                                <SelectItem key={c} value={c}>
                                  {c}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>Unité</Label>
                          <Input {...form.register('unit')} placeholder="sac, m³…" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>Description</Label>
                        <Input {...form.register('description')} />
                      </div>
                      <div className="space-y-1">
                        <Label>Image (URL ou fichier)</Label>
                        <Input
                          type="text"
                          placeholder="https://… ou téléversez une image"
                          {...form.register('imageUrl')}
                        />
                        {form.formState.errors.imageUrl && (
                          <p className="text-xs text-destructive">
                            {form.formState.errors.imageUrl.message}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <input
                            ref={createImageFileRef}
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) uploadImageForCreate.mutate(f)
                              e.target.value = ''
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={uploadImageForCreate.isPending}
                            onClick={() => createImageFileRef.current?.click()}
                          >
                            {uploadImageForCreate.isPending && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Téléverser une image
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Fichier jpeg/png/gif/webp (max 5 Mo) ou lien https / CDN. Les fichiers sont stockés sur le
                          service produit.
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label>Prix unitaire (XOF)</Label>
                        <Input type="number" step="0.01" {...form.register('unitPrice')} />
                      </div>
                      <DialogFooter>
                        <Button
                          type="submit"
                          disabled={createMutation.isPending || uploadImageForCreate.isPending}
                        >
                          {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Créer
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher…"
                className="pl-8 w-72 max-w-full"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Toutes catégories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Actif" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tous</SelectItem>
                <SelectItem value="active">Actifs seulement</SelectItem>
                <SelectItem value="inactive">Inactifs seulement</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="secondary" size="sm" onClick={loadGraphql}>
              <Braces className="h-4 w-4 mr-1" />
              Aperçu catalogue
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {gqlPreview && (
            <pre className="mb-4 max-h-40 overflow-auto rounded-md border bg-muted/40 p-3 text-[11px] font-mono">
              {gqlPreview}
            </pre>
          )}
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Chargement…</div>
          ) : products.length === 0 ? (
            <DataTableEmpty message="Aucun produit — créez-en un (ADMIN) ou élargissez les filtres." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Image</TableHead>
                  <TableHead>Unité</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead className="text-right">Prix</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-12 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    title="Voir le détail du produit"
                    onClick={() => navigate(`/products/${p.id}`)}
                  >
                    <TableCell className="align-middle" onClick={(e) => e.stopPropagation()}>
                      <ProductTableThumb imageUrl={p.imageUrl} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.unit}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                      </div>
                      {p.description && (
                        <div className="text-xs text-muted-foreground">{p.description}</div>
                      )}
                    </TableCell>
                    <TableCell>{p.category}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(p.unitPrice, p.currency ?? 'XOF')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.isActive ? 'default' : 'outline'}>
                        {p.isActive ? 'Actif' : 'Inactif'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end">
                        <RowActionsMenu ariaLabel={`Actions produit ${p.name}`}>
                          <DropdownMenuItem onClick={() => navigate(`/products/${p.id}`)}>
                            Détail
                          </DropdownMenuItem>
                          {canManage && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditProduct(p)
                                  editForm.reset({
                                    name: p.name,
                                    category: p.category,
                                    unit: p.unit,
                                    description: p.description ?? '',
                                    imageUrl: p.imageUrl ?? '',
                                    unitPrice: p.unitPrice,
                                    isActive: p.isActive !== false,
                                  })
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Modifier
                              </DropdownMenuItem>
                              {p.isActive && (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => {
                                    if (confirm(`Désactiver « ${p.name} » ?`)) {
                                      deactivateMutation.mutate(p.id)
                                    }
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Désactiver
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                        </RowActionsMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detailId} onOpenChange={(o) => !o && navigate('/products', { replace: true })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Détail produit</DialogTitle>
          </DialogHeader>
          {loadingDetail || !detailProduct ? (
            <div className="py-8 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              {detailProduct.imageUrl?.trim() ? (
                <div className="mb-3">
                  <span className="text-muted-foreground block text-xs mb-1">Image</span>
                  <img
                    src={detailProduct.imageUrl.trim()}
                    alt={detailProduct.name}
                    className="max-h-40 max-w-full rounded-md border object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : null}
              <p>
                <span className="text-muted-foreground">Nom</span> {detailProduct.name}
              </p>
              <p>
                <span className="text-muted-foreground">Catégorie</span> {detailProduct.category}
              </p>
              <p>
                <span className="text-muted-foreground">Unité</span> {detailProduct.unit}
              </p>
              <p>
                <span className="text-muted-foreground">Prix</span>{' '}
                {formatCurrency(detailProduct.unitPrice, detailProduct.currency ?? 'XOF')}
              </p>
              <p>
                <span className="text-muted-foreground">Actif</span>{' '}
                {detailProduct.isActive ? 'oui' : 'non'}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editProduct}
        onOpenChange={(o) => {
          if (!o) setEditProduct(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le produit</DialogTitle>
          </DialogHeader>
          {editProduct && (
            <form
              onSubmit={editForm.handleSubmit((v) =>
                updateMutation.mutate({
                  id: editProduct.id,
                  body: { ...v, imageUrl: v.imageUrl ?? null },
                })
              )}
              className="space-y-4"
            >
              <div className="space-y-1">
                <Label>Nom</Label>
                <Input {...editForm.register('name')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Catégorie</Label>
                  <Select
                    value={editForm.watch('category')}
                    onValueChange={(v) => editForm.setValue('category', v as ProductCategory)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Unité</Label>
                  <Input {...editForm.register('unit')} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input {...editForm.register('description')} />
              </div>
              <div className="space-y-1">
                <Label>Image (URL ou fichier)</Label>
                <Input
                  type="text"
                  placeholder="https://… ou téléversez une image"
                  {...editForm.register('imageUrl')}
                />
                {editForm.formState.errors.imageUrl && (
                  <p className="text-xs text-destructive">
                    {editForm.formState.errors.imageUrl.message}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    ref={editImageFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) uploadImageForEdit.mutate(f)
                      e.target.value = ''
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadImageForEdit.isPending}
                    onClick={() => editImageFileRef.current?.click()}
                  >
                    {uploadImageForEdit.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Téléverser une image
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Prix unitaire</Label>
                <Input type="number" step="0.01" {...editForm.register('unitPrice')} />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 px-3 py-2">
                <div className="space-y-0.5">
                  <Label htmlFor="product-edit-active">Produit actif</Label>
                  <p className="text-xs text-muted-foreground">
                    Un produit inactif disparaît des sélections catalogue côté commandes.
                  </p>
                </div>
                <Controller
                  name="isActive"
                  control={editForm.control}
                  render={({ field }) => (
                    <Switch
                      id="product-edit-active"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={updateMutation.isPending}
                    />
                  )}
                />
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={updateMutation.isPending || uploadImageForEdit.isPending}
                >
                  {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enregistrer
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
