import vine from '@vinejs/vine'

export const MACHINE_STATUSES = ['AVAILABLE', 'IN_USE', 'MAINTENANCE'] as const
export const MACHINE_CATEGORIES = ['CIMENT', 'FER', 'BRIQUES', 'GRANULATS'] as const

export const createMachineValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(120),
    category: vine.enum(MACHINE_CATEGORIES).optional(),
    status: vine.enum(MACHINE_STATUSES).optional(),
  })
)

export const updateMachineStatusValidator = vine.compile(
  vine.object({
    status: vine.enum(MACHINE_STATUSES),
  })
)

/**
 * Returns true when a machine can transition from `from` to `to`.
 * Allowed transitions:
 *   AVAILABLE   → IN_USE, MAINTENANCE
 *   IN_USE      → AVAILABLE, MAINTENANCE
 *   MAINTENANCE → AVAILABLE
 *
 * Same-state "transitions" (e.g. AVAILABLE → AVAILABLE) are treated as no-ops
 * and allowed — callers can update other fields without bumping status.
 */
export function isValidMachineTransition(
  from: (typeof MACHINE_STATUSES)[number],
  to: (typeof MACHINE_STATUSES)[number]
): boolean {
  if (from === to) return true
  const allowed: Record<(typeof MACHINE_STATUSES)[number], (typeof MACHINE_STATUSES)[number][]> = {
    AVAILABLE: ['IN_USE', 'MAINTENANCE'],
    IN_USE: ['AVAILABLE', 'MAINTENANCE'],
    MAINTENANCE: ['AVAILABLE'],
  }
  return allowed[from].includes(to)
}
