import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, Pencil, Plus, Shield, Trash2 } from 'lucide-react'

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
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { RowActionsMenu } from '@/components/RowActionsMenu'
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

const editUserSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().optional(),
  isActive: z.boolean(),
})
type EditUserForm = z.infer<typeof editUserSchema>

const ROLE_COLORS: Record<User['role'], 'default' | 'secondary' | 'outline' | 'warning'> = {
  ADMIN: 'default',
  OPERATOR: 'secondary',
  CLIENT: 'outline',
}

export default function UsersPage() {
  const [open, setOpen] = useState(false)
  const [roleFilter, setRoleFilter] = useState<string>('__all__')
  const [editUser, setEditUser] = useState<User | null>(null)
  const [roleUser, setRoleUser] = useState<User | null>(null)
  const [newRole, setNewRole] = useState<User['role']>('CLIENT')
  const qc = useQueryClient()

  const listParams = {
    limit: 100 as const,
    ...(roleFilter !== '__all__' ? { role: roleFilter } : {}),
  }

  const { data, isLoading } = useQuery({
    queryKey: ['users', listParams],
    queryFn: () => usersService.list(listParams),
  })

  const { data: editUserRemote } = useQuery({
    queryKey: ['user', editUser?.id],
    queryFn: () => usersService.get(editUser!.id),
    enabled: !!editUser?.id,
  })

  const users = asArray<User>(data)

  const form = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'CLIENT' },
  })

  const editForm = useForm<EditUserForm>({
    resolver: zodResolver(editUserSchema),
  })

  useEffect(() => {
    const u = editUserRemote ?? editUser
    if (!u) return
    editForm.reset({
      firstName: u.firstName ?? '',
      lastName: u.lastName ?? '',
      phone: u.phone ?? '',
      isActive: u.isActive !== false,
    })
  }, [editUserRemote, editUser, editForm])

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

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EditUserForm }) =>
      usersService.update(id, {
        firstName: payload.firstName,
        lastName: payload.lastName,
        phone: payload.phone || undefined,
        isActive: payload.isActive,
      }),
    onSuccess: () => {
      toast.success('Profil mis à jour')
      qc.invalidateQueries({ queryKey: ['users'] })
      setEditUser(null)
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: User['role'] }) => usersService.updateRole(id, role),
    onSuccess: () => {
      toast.success('Rôle mis à jour')
      qc.invalidateQueries({ queryKey: ['users'] })
      setRoleUser(null)
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
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Utilisateurs</CardTitle>
          <CardDescription>{users.length} utilisateur(s) affiché(s)</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrer par rôle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Tous les rôles</SelectItem>
              <SelectItem value="ADMIN">ADMIN</SelectItem>
              <SelectItem value="OPERATOR">OPERATOR</SelectItem>
              <SelectItem value="CLIENT">CLIENT</SelectItem>
            </SelectContent>
          </Select>
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
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Chargement…</div>
        ) : users.length === 0 ? (
          <DataTableEmpty message="Aucun utilisateur pour ce filtre" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Actif</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead className="w-12 text-right">Actions</TableHead>
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
                  <TableCell>
                    {u.isActive === false ? (
                      <Badge variant="secondary">Non</Badge>
                    ) : (
                      <Badge variant="outline">Oui</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      <RowActionsMenu ariaLabel={`Actions utilisateur ${u.email}`}>
                        <DropdownMenuItem onClick={() => setEditUser(u)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setRoleUser(u)
                            setNewRole(u.role)
                          }}
                        >
                          <Shield className="mr-2 h-4 w-4" />
                          Changer le rôle
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            if (confirm(`Supprimer ${u.email} ?`)) {
                              deleteMutation.mutate(u.id)
                            }
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Supprimer
                        </DropdownMenuItem>
                      </RowActionsMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le profil</DialogTitle>
            <DialogDescription>
              {editUser?.email} — rôle et nom affiché uniquement (l’email ne peut pas être modifié ici).
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={editForm.handleSubmit((v) =>
              editUser ? updateMutation.mutate({ id: editUser.id, payload: v }) : undefined
            )}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Prénom</Label>
                <Input {...editForm.register('firstName')} />
              </div>
              <div className="space-y-1">
                <Label>Nom</Label>
                <Input {...editForm.register('lastName')} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Téléphone</Label>
              <Input {...editForm.register('phone')} />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="user-active"
                type="checkbox"
                className="h-4 w-4 rounded border"
                checked={editForm.watch('isActive')}
                onChange={(e) => editForm.setValue('isActive', e.target.checked)}
              />
              <Label htmlFor="user-active">Compte actif</Label>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!roleUser} onOpenChange={(o) => !o && setRoleUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer le rôle</DialogTitle>
            <DialogDescription>{roleUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nouveau rôle</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as User['role'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">ADMIN</SelectItem>
                <SelectItem value="OPERATOR">OPERATOR</SelectItem>
                <SelectItem value="CLIENT">CLIENT</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={roleMutation.isPending || !roleUser || newRole === roleUser.role}
              onClick={() => roleUser && roleMutation.mutate({ id: roleUser.id, role: newRole })}
            >
              {roleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Mettre à jour le rôle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
