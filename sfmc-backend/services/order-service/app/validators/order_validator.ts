import vine from '@vinejs/vine'

export const createOrderValidator = vine.compile(
  vine.object({
    customerId: vine.string().uuid(),
    lines: vine
      .array(
        vine.object({
          productId: vine.string().uuid(),
          quantity: vine.number().positive(),
          unitPrice: vine.number().min(0),
        })
      )
      .minLength(1),
    /**
     * Optionnel. Chaîne vide ou format Bénin : `+22901` + 8 chiffres (ex. +22901512345678).
     */
    mobileMoneyPhone: vine.string().trim().regex(/^(\+22901\d{8})?$/).optional(),
  })
)

export const updateStatusValidator = vine.compile(
  vine.object({
    status: vine.enum([
      'PENDING',
      'VALIDATED',
      'IN_PRODUCTION',
      'READY',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED',
    ] as const),
    /** Mono-entrepôt lorsque `status` = `SHIPPED`. */
    warehouseId: vine.string().uuid().optional(),
    /** Multi-entrepôts (optionnel) : si non vide, prime sur `warehouseId`. */
    allocations: vine
      .array(
        vine.object({
          productId: vine.string().uuid(),
          quantity: vine.number().positive(),
          warehouseId: vine.string().uuid(),
        })
      )
      .optional(),
  })
)
