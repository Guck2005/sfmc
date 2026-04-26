import { z } from 'zod'
import type { Warehouse } from '@/types/domain'

export const warehouseSchema = z.object({
  name: z.string().min(2, '2 caractères minimum'),
  location: z.string().min(2, '2 caractères minimum'),
  capacity: z.coerce.number().positive('Doit être positif'),
})
export type WarehouseFormInput = z.input<typeof warehouseSchema>
export type WarehouseFormOutput = z.output<typeof warehouseSchema>

export const movementFormSchema = z
  .object({
    stockId: z.string().uuid('UUID ligne de stock requis'),
    type: z.enum(['IN', 'OUT', 'ADJUSTMENT']),
    quantity: z.coerce.number().positive('Quantité > 0'),
    origin: z.string().min(2, 'Origine / motif (2 car. min.)'),
    referenceId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const r = data.referenceId?.trim()
    if (r && !z.string().uuid().safeParse(r).success) {
      ctx.addIssue({ code: 'custom', path: ['referenceId'], message: 'UUID invalide ou laisser vide' })
    }
  })
export type MovementFormOutput = z.output<typeof movementFormSchema>

export const MOVEMENT_FILTER_ALL = '__all__'

/** Libellés UI ; l’API conserve IN / OUT / ADJUSTMENT. */
export function movementTypeLabel(type: string) {
  switch (type) {
    case 'IN':
      return 'Entrée'
    case 'OUT':
      return 'Sortie'
    case 'ADJUSTMENT':
      return "Ajustement d'inventaire"
    default:
      return type
  }
}

/**
 * L’API stocke `origin` comme chaîne libre : codes techniques (souvent snake_case anglais)
 * écrits par le code métier, ou libellés libres (ex. saisie utilisateur, seed démo en français).
 * On mappe les codes connus pour l’UI ; le reste s’affiche tel quel (infobulle = valeur brute).
 */
const MOVEMENT_ORIGIN_LABELS: Record<string, string> = {
  order_shipped: 'Expédition commande',
  'production.completed': 'Fin de production',
  'pending_reception.confirmed': 'Réception en attente confirmée',
  AJUSTEMENT_MANUEL_UI: 'Saisie manuelle (interface)',
  cu03_integration_test: "Test d'intégration (CU03)",
  cu03_integration_test_rollback: "Annulation test d'intégration (CU03)",
}

export function movementOriginLabel(origin: string): string {
  const direct = MOVEMENT_ORIGIN_LABELS[origin]
  if (direct) return direct
  const normalized = origin.replace(/-/g, '_')
  return MOVEMENT_ORIGIN_LABELS[normalized] ?? origin
}

export function warehouseLabel(id: string | undefined, warehouses: Warehouse[]) {
  if (!id) return '—'
  return warehouses.find((w) => w.id === id)?.name ?? id.slice(0, 8) + '…'
}
