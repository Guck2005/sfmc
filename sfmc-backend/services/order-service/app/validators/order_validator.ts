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
  })
)
