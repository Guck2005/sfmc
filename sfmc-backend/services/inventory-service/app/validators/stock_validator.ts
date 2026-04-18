import vine from '@vinejs/vine'

export const createMovementValidator = vine.compile(
  vine.object({
    stockId: vine.string().uuid(),
    type: vine.enum(['IN', 'OUT', 'ADJUSTMENT'] as const),
    quantity: vine.number().positive(),
    origin: vine.string().minLength(1).maxLength(255),
    referenceId: vine.string().uuid().optional(),
  })
)

export const updateThresholdValidator = vine.compile(
  vine.object({
    threshold: vine.number().min(0),
  })
)

export const checkAvailabilityValidator = vine.compile(
  vine.object({
    productId: vine.string().uuid(),
    quantity: vine.number().positive(),
  })
)

export const reserveValidator = vine.compile(
  vine.object({
    orderId: vine.string().uuid(),
    sagaId: vine.string().optional(),
    lines: vine
      .array(
        vine.object({
          productId: vine.string().uuid(),
          quantity: vine.number().positive(),
        })
      )
      .minLength(1),
  })
)

export const releaseValidator = reserveValidator
