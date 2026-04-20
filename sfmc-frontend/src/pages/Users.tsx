import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { usersService } from '@/services'
import { asArray } from '@/lib/pagination'
import { formatDate } from '@/lib/utils'
import { extractErrorMessage } from '@/lib/api'
import type { User } from '@/types/domain'
import { DataTableEmpty } from '@/components/DataTableEmpty'

const createUserSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8, '8 caractères minimum'),
  role: z.enum(['ADMIN', 'OPERATOR', 'CLIENT']),
})
type CreateUserForm = z.infer<typeof createUserSchema>

const ROLE_COLORS: Record<User['role'], 'default' | 'secondary' | 'outline' | 'warning'> = {
  ADMIN: 'default',
  OPERATOR: 'secondary',
  CLIENT: 'outline',
}

export default function UsersPage() {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersService.list({ limit: 100 }),
  })

  const users = asArray<User>(data)

  const form = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'CLIENT' },
  })

  const createMutation = useMutation({
    mutationFn: (payload: CreateUserForm) => usersService.create(payload),
    onSuccess: () => {
      toast.success('Utilisateur créé')
      qc.invalidateQueries({ queryKey: ['users'] })
      setOpen(false)
      form.reset()
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersService.remove(id),
    onSuccess: () => {
      toast.success('Utilisateur supprimé')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Utilisateurs</CardTitle>
          <CardDescription>{users.length} utilisateur(s)</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              Nouveau
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer un utilisateur</DialogTitle>
              <DialogDescription>
                Le mot de passe sera transmis à l'intéressé par canal sécurisé.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Prénom</Label>
                  <Input {...form.register('firstName')} />
                </div>
                <div className="space-y-1">
                  <Label>Nom</Label>
                  <Input {...form.register('lastName')} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" {...form.register('email')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Téléphone</Label>
                  <Input {...form.register('phone')} />
                </div>
                <div className="space-y-1">
                  <Label>Rôle</Label>
                  <Select
                    value={form.watch('role')}
                    onValueChange={(v) => form.setValue('role', v as User['role'])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">Administrateur</SelectItem>
                      <SelectItem value="OPERATOR">Opérateur</SelectItem>
                      <SelectItem value="CLIENT">Client</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Mot de passe initial</Label>
                <Input type="password" {...form.register('password')} />
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
        ) : users.length === 0 ? (
          <DataTableEmpty message="Aucun utilisateur enregistré" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={ROLE_COLORS[u.role]}>{u.role}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(u.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Supprimer ${u.email} ?`)) {
                          deleteMutation.mutate(u.id)
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
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
