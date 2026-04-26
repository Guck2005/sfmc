import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const ORDERS_PAGE_SIZE = 20
/** Taille des lots pour l’export CSV (toutes les pages). */
const ORDERS_EXPORT_CHUNK = 200

function downloadOrdersCsv(rows: Order[]) {
  const headers = ['orderNumber', 'id', 'customerId', 'status', 'totalAmount', 'currency', 'createdAt']
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const lines = [
    headers.join(','),
    ...rows.map((o) =>
      [
        o.orderNumber ?? '',
        o.id,
        o.customerId,
        o.status,
        o.totalAmount,
        o.currency,
        o.createdAt,
      ]
        .map(esc)
        .join(','),
    ),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `orders_export_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Download, Loader2, Plus, Search, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { ordersService, productsService, usersService } from '@/services'
import { asArray, paginationMeta } from '@/lib/pagination'
import { extractErrorMessage } from '@/lib/api'
import { DataTableEmpty } from '@/components/DataTableEmpty'
import { useAuthStore } from '@/stores/auth-store'
import type { Order, OrderStatus, Product, User } from '@/types/domain'

const STATUS_COLORS: Record<OrderStatus, 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive'> = {
  PENDING: 'outline',
  VALIDATED: 'secondary',
  IN_PRODUCTION: 'warning',
  READY: 'secondary',
  SHIPPED: 'default',
  DELIVERED: 'success',
  CANCELLED: 'destructive',
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'En attente',
  VALIDATED: 'Validée',
  IN_PRODUCTION: 'En production',
  READY: 'Prête',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
}

const orderLineItemSchema = z.object({
  productId: z.string().uuid('Choisissez un produit'),
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().min(0),
})

/**
 * Mobile money Bénin : un seul « + », puis 229, 01, puis exactement 8 chiffres (ex. +22901512345678).
 */
const BENIN_MOBILE_MONEY_REGEX = /^\+22901\d{8}$/

/** Étape 1 client (et base opérateur) : client + lignes uniquement. */
const orderStep1Base = z.object({
  customerId: z.string().uuid('Choisissez un client'),
  lines: z.array(orderLineItemSchema).min(1, 'Au moins une ligne'),
})

const orderSchemaOperator = orderStep1Base.extend({
  mobileMoneyPhone: z
    .string()
    .trim()
    .optional()
    .refine((s) => !s || BENIN_MOBILE_MONEY_REGEX.test(s), {
      message:
        'Format attendu : +22901 suivi de 8 chiffres (+ puis 229, 01, puis 8 chiffres uniquement).',
    }),
})

const orderSchemaClient = orderStep1Base.extend({
  mobileMoneyPhone: z
    .string()
    .trim()
    .regex(BENIN_MOBILE_MONEY_REGEX, {
      message:
        'Numéro obligatoire : +22901 puis 8 chiffres (ex. +22901512345678).',
    }),
})

type OrderFormIn = z.input<typeof orderSchemaOperator>
type OrderFormOut = z.output<typeof orderSchemaOperator> | z.output<typeof orderSchemaClient>

function clientSelectLabel(u: User): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
  if (name) return `${name} (${u.email})`
  return u.email
}

function clientMatchesSearch(u: User, raw: string): boolean {
  const q = raw.trim().toLowerCase()
  if (!q) return false
  if (clientSelectLabel(u).toLowerCase() === q) return true
  const email = (u.email ?? '').toLowerCase()
  const first = (u.firstName ?? '').toLowerCase()
  const last = (u.lastName ?? '').toLowerCase()
  const full = `${first} ${last}`.trim()
  const id = u.id.toLowerCase()
  return (
    email.includes(q) ||
    first.includes(q) ||
    last.includes(q) ||
    full.includes(q) ||
    id.includes(q)
  )
}

async function pollOrderForMobileMoney(
  orderId: string,
  opts: { maxAttempts?: number; delayMs?: number } = {}
): Promise<'awaiting' | 'validated' | 'pending_timeout'> {
  const maxAttempts = opts.maxAttempts ?? 24
  const delayMs = opts.delayMs ?? 350
  for (let i = 0; i < maxAttempts; i++) {
    const cur = await ordersService.get(orderId)
    if (cur.paymentStatus === 'AWAITING_MOBILE_MONEY') return 'awaiting'
    if (cur.status === 'VALIDATED' || cur.status === 'CANCELLED') return 'validated'
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return 'pending_timeout'
}

export default function OrdersPage() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  /** Client uniquement : 1 = produits, 2 = paiement (obligatoire). */
  const [clientOrderStep, setClientOrderStep] = useState<1 | 2>(1)
  const [mmDialogOrder, setMmDialogOrder] = useState<Order | null>(null)
  const [mmPhoneInput, setMmPhoneInput] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [ordersPage, setOrdersPage] = useState(1)
  /** Recherche client (nom, e-mail, id) ; filtre API si une seule correspondance ou client choisi dans la liste. */
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [clientSuggestOpen, setClientSuggestOpen] = useState(false)
  const qc = useQueryClient()
  const role = useAuthStore((s) => s.user?.role)
  const userId = useAuthStore((s) => s.user?.id)
  const isClient = role === 'CLIENT'
  const isAdmin = role === 'ADMIN'

  const listParams = useMemo(() => {
    const p: {
      page: number
      limit: number
      status?: OrderStatus
      customerId?: string
      from?: string
      to?: string
    } = { page: ordersPage, limit: ORDERS_PAGE_SIZE }
    if (statusFilter !== 'ALL') p.status = statusFilter
    if (isClient && userId) p.customerId = userId
    else if (!isClient && selectedCustomerId) {
      p.customerId = selectedCustomerId
    }
    if (fromDate.trim()) p.from = fromDate.trim()
    if (toDate.trim()) p.to = toDate.trim()
    return p
  }, [statusFilter, isClient, userId, selectedCustomerId, fromDate, toDate, ordersPage])

  useEffect(() => {
    setOrdersPage(1)
  }, [statusFilter, selectedCustomerId, fromDate, toDate, isClient, userId])

  const { data, isLoading } = useQuery({
    queryKey: ['orders', listParams],
    queryFn: () => ordersService.list(listParams),
    refetchInterval: 20_000,
  })

  const { data: productsData } = useQuery({
    queryKey: ['products-lite'],
    queryFn: () => productsService.list({ limit: 200 }),
  })

  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: ['users', 'CLIENT', 'for-order-dialog'],
    queryFn: () => usersService.list({ role: 'CLIENT', limit: 500, page: 1 }),
    enabled: open && !isClient,
  })
  const clients = useMemo(
    () => asArray<User>(clientsData).filter((u) => u.role === 'CLIENT'),
    [clientsData]
  )

  const { data: clientsFilterData } = useQuery({
    queryKey: ['users', 'CLIENT', 'orders-filter'],
    queryFn: () => usersService.list({ role: 'CLIENT', limit: 500, page: 1 }),
    enabled: !isClient,
  })
  const allClientsFilter = useMemo(
    () => asArray<User>(clientsFilterData).filter((u) => u.role === 'CLIENT'),
    [clientsFilterData]
  )

  const liveClientMatches = useMemo(() => {
    const q = customerSearch.trim()
    if (!q) return []
    return allClientsFilter.filter((u) => clientMatchesSearch(u, q))
  }, [customerSearch, allClientsFilter])

  useEffect(() => {
    const q = customerSearch.trim()
    const id = window.setTimeout(() => {
      if (!q) {
        setSelectedCustomerId(null)
        return
      }
      const matches = allClientsFilter.filter((u) => clientMatchesSearch(u, q))
      if (matches.length === 1) {
        setSelectedCustomerId(matches[0]!.id)
        return
      }
      setSelectedCustomerId((prev) => {
        if (!prev) return null
        if (matches.some((m) => m.id === prev)) return prev
        const prevUser = allClientsFilter.find((c) => c.id === prev)
        if (!prevUser) return null
        if (clientSelectLabel(prevUser).trim().toLowerCase() === q.toLowerCase()) return prev
        if (prevUser.id.toLowerCase() === q.toLowerCase()) return prev
        return null
      })
    }, 280)
    return () => window.clearTimeout(id)
  }, [customerSearch, allClientsFilter])

  const orders = asArray<Order>(data)
  const ordersListMeta = paginationMeta(data)
  const canExportOrders = (ordersListMeta?.total ?? 0) > 0 || orders.length > 0

  const exportOrdersMutation = useMutation({
    mutationFn: async (params: typeof listParams) => {
      const { page: _p, ...rest } = params
      let current = 1
      let lastPage = 1
      const acc: Order[] = []
      do {
        const res = await ordersService.list({ ...rest, page: current, limit: ORDERS_EXPORT_CHUNK })
        acc.push(...asArray<Order>(res))
        const m = paginationMeta(res)
        lastPage = m?.lastPage ?? 1
        current++
      } while (current <= lastPage)
      return acc
    },
    onSuccess: (rows) => {
      if (rows.length === 0) {
        toast.message('Aucune commande à exporter pour ces filtres.')
        return
      }
      downloadOrdersCsv(rows)
      toast.success(`${rows.length} commande${rows.length > 1 ? 's' : ''} exportée${rows.length > 1 ? 's' : ''}.`)
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const products = asArray<Product>(productsData)
  const productMap = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products]
  )

  const form = useForm<OrderFormIn, unknown, OrderFormOut>({
    resolver: zodResolver(isClient ? orderSchemaClient : orderSchemaOperator),
    defaultValues: {
      customerId: isClient ? (userId ?? '') : '',
      lines: [{ productId: '', quantity: 1, unitPrice: 0 }],
      mobileMoneyPhone: '',
    },
  })

  function goClientToPaymentStep() {
    const vals = form.getValues()
    const parsed = orderStep1Base.safeParse(vals)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.')
        if (path) {
          form.setError(path as 'customerId' | `lines.${number}.productId` | `lines.${number}.quantity` | `lines.${number}.unitPrice`, {
            type: 'manual',
            message: issue.message,
          })
        }
      }
      return
    }
    form.clearErrors()
    setClientOrderStep(2)
  }

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  })

  const createMutation = useMutation({
    mutationFn: (payload: OrderFormOut) => {
      const { mobileMoneyPhone, ...rest } = payload
      const phone = mobileMoneyPhone?.trim() ?? ''
      return ordersService.create({
        ...rest,
        ...(isClient
          ? { mobileMoneyPhone: phone }
          : BENIN_MOBILE_MONEY_REGEX.test(phone)
            ? { mobileMoneyPhone: phone }
            : {}),
      })
    },
    onSuccess: async (order) => {
      toast.success('Commande créée — traitement automatique en cours')
      qc.invalidateQueries({ queryKey: ['orders'] })
      setOpen(false)
      setClientOrderStep(1)
      form.reset({
        customerId: isClient ? (userId ?? '') : '',
        lines: [{ productId: '', quantity: 1, unitPrice: 0 }],
        mobileMoneyPhone: '',
      })
      try {
        const outcome = await pollOrderForMobileMoney(order.id)
        if (outcome === 'awaiting') {
          const latest = await ordersService.get(order.id)
          setMmDialogOrder(latest)
          setMmPhoneInput(latest.mobileMoneyPhone ?? '')
        }
      } catch {
        /* poll optionnel — ne pas bloquer la création */
      }
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const mmStubPayMutation = useMutation({
    mutationFn: async () => {
      const id = mmDialogOrder!.id
      const phone = mmPhoneInput.trim()
      if (!BENIN_MOBILE_MONEY_REGEX.test(phone)) {
        throw new Error('Format attendu : +22901 suivi de 8 chiffres.')
      }
      await ordersService.initMobileMoney(id, phone)
      return ordersService.completeMobileMoneyLocal(id)
    },
    onSuccess: () => {
      toast.success('Paiement mobile money simulé — commande validée')
      setMmDialogOrder(null)
      setMmPhoneInput('')
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => ordersService.cancel(id),
    onSuccess: () => {
      toast.success('Commande annulée')
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ordersService.remove(id),
    onSuccess: () => {
      toast.success('Commande supprimée')
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const cancellableStatuses = ['PENDING', 'VALIDATED', 'IN_PRODUCTION', 'READY'] as const
  const canShowCancel = (o: Order) =>
    cancellableStatuses.includes(o.status as (typeof cancellableStatuses)[number]) &&
    (!isClient || o.customerId === userId)

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>{isClient ? 'Mes commandes' : 'Commandes'}</CardTitle>
        <CardDescription>
          {isClient
            ? 'Suivez vos commandes, leur statut et le paiement mobile money le cas échéant.'
            : 'Filtrez par statut, période (date de création) et recherche client ; export CSV possible.'}
        </CardDescription>
        <p className="text-sm text-muted-foreground">
          {isClient
            ? 'Nouvelle commande : étapes produits puis numéro mobile money obligatoire (+22901 + 8 chiffres).'
            : 'Nouvelle commande : la saga (stock, production, facturation) s’enclenche après validation.'}
        </p>
        <div className="flex flex-col gap-3 border-t pt-4 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
          <div className="flex min-w-0 flex-nowrap items-end gap-2 pb-0.5">
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as OrderStatus | 'ALL')}
            >
              <SelectTrigger className="h-10 w-[220px] shrink-0">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Filtrer par statut</SelectItem>
                {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex shrink-0 items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Du</Label>
              <Input
                type="date"
                className="h-10 w-[150px] shrink-0"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                aria-label="Créées depuis"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Au</Label>
              <Input
                type="date"
                className="h-10 w-[150px] shrink-0"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                aria-label="Créées jusqu’au"
              />
            </div>
            {!isClient && (
              <div className="relative h-10 w-[min(18rem,calc(100vw-12rem))] min-w-[12rem] shrink-0 sm:w-[18rem]">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  className="h-10 pl-9 pr-9 font-normal"
                  placeholder="Rechercher un client (nom, e-mail, id…)"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  onFocus={() => setClientSuggestOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setClientSuggestOpen(false), 180)
                  }}
                  aria-label="Recherche client"
                  autoComplete="off"
                  spellCheck={false}
                />
                {customerSearch.trim() ? (
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Effacer la recherche client"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setCustomerSearch('')
                      setSelectedCustomerId(null)
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
                {clientSuggestOpen &&
                customerSearch.trim() &&
                liveClientMatches.length > 1 ? (
                  <ul
                    className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-auto rounded-md border bg-popover py-1 text-popover-foreground shadow-md"
                    role="listbox"
                  >
                    {liveClientMatches.slice(0, 14).map((u) => (
                      <li key={u.id} role="option">
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            setSelectedCustomerId(u.id)
                            setCustomerSearch(clientSelectLabel(u))
                            setClientSuggestOpen(false)
                          }}
                        >
                          {clientSelectLabel(u)}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {clientSuggestOpen &&
                customerSearch.trim() &&
                liveClientMatches.length === 0 &&
                allClientsFilter.length > 0 ? (
                  <p className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md">
                    Aucun client ne correspond à cette recherche.
                  </p>
                ) : null}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={exportOrdersMutation.isPending || !canExportOrders}
              onClick={() => exportOrdersMutation.mutate(listParams)}
            >
              {exportOrdersMutation.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1 h-3.5 w-3.5" />
              )}
              Exporter
            </Button>
            <Button type="button" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Nouvelle commande
            </Button>
          </div>
        </div>
      </CardHeader>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setClientOrderStep(1)
        }}
      >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {isClient
                  ? clientOrderStep === 1
                    ? 'Passer commande — étape 1 sur 2'
                    : 'Passer commande — étape 2 sur 2'
                  : 'Nouvelle commande'}
              </DialogTitle>
              <DialogDescription>
                {isClient ? (
                  clientOrderStep === 1 ? (
                    <>Sélectionnez les produits et les quantités.</>
                  ) : (
                    <>
                      Paiement par <strong>mobile money</strong> : numéro obligatoire au format{' '}
                      <span className="font-mono text-xs">+22901</span> puis 8 chiffres.
                    </>
                  )
                ) : (
                  <>
                    La commande déclenchera la saga de validation inter-services (stock, production,
                    facturation).
                  </>
                )}
              </DialogDescription>
              {isClient && (
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <span className={clientOrderStep === 1 ? 'font-semibold text-foreground' : ''}>1. Produits</span>
                  <span aria-hidden>→</span>
                  <span className={clientOrderStep === 2 ? 'font-semibold text-foreground' : ''}>2. Paiement</span>
                </div>
              )}
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (isClient && clientOrderStep === 1) {
                  goClientToPaymentStep()
                  return
                }
                void form.handleSubmit((data) => createMutation.mutate(data))(e)
              }}
              className="space-y-4"
            >
              {isClient ? (
                <input
                  type="hidden"
                  {...form.register('customerId')}
                  value={userId ?? ''}
                  readOnly
                />
              ) : (
                <div className="space-y-1">
                  <Label>Client</Label>
                  <Controller
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                      <Select
                        value={field.value || undefined}
                        onValueChange={field.onChange}
                        disabled={clientsLoading || clients.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              clientsLoading
                                ? 'Chargement des clients…'
                                : clients.length === 0
                                  ? 'Aucun client actif'
                                  : 'Choisir le compte client…'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {clientSelectLabel(u)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {form.formState.errors.customerId && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.customerId.message}
                    </p>
                  )}
                </div>
              )}

              {(!isClient || clientOrderStep === 1) && (
                <div className="space-y-2">
                  <Label>{isClient ? 'Vos produits' : 'Lignes'}</Label>
                  {fields.map((f, idx) => (
                    <div key={f.id} className="grid grid-cols-12 gap-2 items-start">
                      <div className="col-span-6">
                        <Select
                          value={form.watch(`lines.${idx}.productId`)}
                          onValueChange={(v) => {
                            form.setValue(`lines.${idx}.productId`, v)
                            const p = productMap[v]
                            if (p) form.setValue(`lines.${idx}.unitPrice`, p.unitPrice)
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Produit…" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.unit} — {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        placeholder="Qté"
                        className="col-span-2"
                        {...form.register(`lines.${idx}.quantity`)}
                      />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="PU"
                        className="col-span-3"
                        {...form.register(`lines.${idx}.unitPrice`)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(idx)}
                        disabled={fields.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ productId: '', quantity: 1, unitPrice: 0 })}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Ajouter une ligne
                  </Button>
                </div>
              )}

              {isClient && clientOrderStep === 2 && (
                <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
                  <p className="font-medium text-foreground">Récapitulatif</p>
                  <ul className="space-y-1.5 list-none pl-0">
                    {form.watch('lines').map((line, idx) => {
                      const p = line.productId ? productMap[line.productId] : undefined
                      const qty = Number(line.quantity ?? 0)
                      const sub = qty * Number(line.unitPrice ?? 0)
                      return (
                        <li key={idx} className="flex justify-between gap-2">
                          <span>
                            {p ? p.name : 'Produit'}{' '}
                            <span className="text-muted-foreground tabular-nums">× {qty}</span>
                          </span>
                          <span className="tabular-nums shrink-0">
                            {sub.toLocaleString('fr-FR')} F
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                  <p className="text-right font-semibold border-t pt-2 tabular-nums">
                    Total :{' '}
                    {form
                      .watch('lines')
                      .reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    F CFA
                  </p>
                </div>
              )}

              {(!isClient || (isClient && clientOrderStep === 2)) && (
                <div className="space-y-1">
                  <Label htmlFor="mm-phone-order">
                    {isClient ? 'Numéro mobile money (obligatoire)' : 'Mobile money (optionnel)'}
                  </Label>
                  <Input
                    id="mm-phone-order"
                    placeholder={isClient ? '+22901512345678' : '+22901512345678 (optionnel)'}
                    autoComplete="tel"
                    {...form.register('mobileMoneyPhone')}
                  />
                  {form.formState.errors.mobileMoneyPhone && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.mobileMoneyPhone.message}
                    </p>
                  )}
                </div>
              )}

              <DialogFooter className="flex flex-wrap gap-2 sm:justify-end">
                {isClient && clientOrderStep === 1 && (
                  <>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                      Annuler
                    </Button>
                    <Button type="submit">Continuer vers le paiement</Button>
                  </>
                )}
                {isClient && clientOrderStep === 2 && (
                  <>
                    <Button type="button" variant="outline" onClick={() => setClientOrderStep(1)}>
                      Retour aux produits
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending}>
                      {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Confirmer et commander
                    </Button>
                  </>
                )}
                {!isClient && (
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Créer la commande
                  </Button>
                )}
              </DialogFooter>
            </form>
          </DialogContent>
      </Dialog>

      <CardContent>
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Chargement…</div>
        ) : orders.length === 0 ? (
          <DataTableEmpty message="Aucune commande enregistrée" />
        ) : (
          <>
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° commande</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow
                  key={o.id}
                  className="cursor-pointer"
                  title="Voir le détail de la commande"
                  onClick={() => navigate(`/orders/${o.id}`)}
                >
                  <TableCell className="align-middle max-w-[14rem]">
                    <div className="font-medium text-sm">{o.orderNumber ?? o.id.slice(0, 8) + '…'}</div>
                    {!o.orderNumber && (
                      <div className="truncate font-mono text-[10px] text-muted-foreground" title={o.id}>
                        {o.id}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="align-middle">
                    <div className="font-medium text-sm">
                      {o.customerDisplayName?.trim() ||
                        (isClient ? 'Moi' : `Client ${o.customerId.slice(0, 8)}…`)}
                    </div>
                  </TableCell>
                  <TableCell className="align-middle">
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant={STATUS_COLORS[o.status]}>{STATUS_LABELS[o.status]}</Badge>
                      {o.paymentStatus === 'AWAITING_MOBILE_MONEY' && (
                        <Badge variant="outline" className="text-xs">
                          Paiement MM
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell
                    className="text-right align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-end">
                      <RowActionsMenu ariaLabel={`Actions commande ${o.id.slice(0, 8)}`}>
                        <DropdownMenuItem asChild>
                          <Link to={`/orders/${o.id}`}>Voir détail</Link>
                        </DropdownMenuItem>
                        {canShowCancel(o) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                if (confirm('Annuler cette commande ?')) {
                                  cancelMutation.mutate(o.id)
                                }
                              }}
                            >
                              Annuler
                            </DropdownMenuItem>
                          </>
                        )}
                        {isAdmin && canShowCancel(o) && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  'Supprimer définitivement cette commande ? Les stocks et la facturation seront ajustés en conséquence.'
                                )
                              ) {
                                deleteMutation.mutate(o.id)
                              }
                            }}
                          >
                            Supprimer définitivement
                          </DropdownMenuItem>
                        )}
                      </RowActionsMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
            {ordersListMeta && ordersListMeta.total > 0 ? (
              <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Page <span className="font-medium text-foreground">{ordersListMeta.page}</span> sur{' '}
                  <span className="font-medium text-foreground">{ordersListMeta.lastPage}</span>
                  {' · '}
                  {ordersListMeta.total} commande{ordersListMeta.total > 1 ? 's' : ''} au total
                  {ordersListMeta.total > orders.length ? (
                    <span className="text-muted-foreground">
                      {' '}
                      ({orders.length} affichée{orders.length > 1 ? 's' : ''} sur cette page)
                    </span>
                  ) : null}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={ordersPage <= 1 || isLoading}
                    onClick={() => setOrdersPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Précédent
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={ordersPage >= ordersListMeta.lastPage || isLoading}
                    onClick={() => setOrdersPage((p) => Math.min(ordersListMeta.lastPage, p + 1))}
                  >
                    Suivant
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>

      <CardFooter className="flex flex-col gap-3 border-t bg-muted/30 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Export CSV (toutes les commandes correspondant aux filtres) et nouvelle commande (raccourcis).
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={exportOrdersMutation.isPending || !canExportOrders}
            onClick={() => exportOrdersMutation.mutate(listParams)}
          >
            {exportOrdersMutation.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1 h-3.5 w-3.5" />
            )}
            Exporter
          </Button>
          <Button type="button" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nouvelle commande
          </Button>
        </div>
      </CardFooter>
    </Card>

    <Dialog
      open={!!mmDialogOrder}
      onOpenChange={(o) => {
        if (!o) {
          setMmDialogOrder(null)
          setMmPhoneInput('')
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Paiement mobile money (local)</DialogTitle>
          <DialogDescription>
            Le serveur attend la confirmation du prestataire (webhook signé{' '}
            <span className="font-mono text-xs">POST /api/v1/webhooks/mobile-money</span> avec{' '}
            <span className="font-mono text-xs">PAYMENT_WEBHOOK_SECRET</span>). En développement, si{' '}
            <span className="font-mono text-xs">ALLOW_PAYMENT_COMPLETE_LOCAL=true</span>, le bouton ci-dessous
            remplace l’appel PSP.
          </DialogDescription>
        </DialogHeader>
        {mmDialogOrder && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Commande {mmDialogOrder.orderNumber ?? mmDialogOrder.id.slice(0, 8)} —{' '}
              {Number(mmDialogOrder.totalAmount).toLocaleString('fr-FR')} F CFA
            </p>
            <div className="space-y-1">
              <Label htmlFor="mm-phone-follow">Numéro mobile money (+22901 + 8 chiffres)</Label>
              <Input
                id="mm-phone-follow"
                value={mmPhoneInput}
                onChange={(e) => setMmPhoneInput(e.target.value)}
                placeholder="+22901512345678"
                autoComplete="tel"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setMmDialogOrder(null)}>
                Plus tard
              </Button>
              <Button
                type="button"
                disabled={mmStubPayMutation.isPending}
                onClick={() => mmStubPayMutation.mutate()}
              >
                {mmStubPayMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Simuler paiement réussi
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  )
}
