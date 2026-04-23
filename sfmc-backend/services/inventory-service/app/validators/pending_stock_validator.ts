import vine from '@vinejs/vine'

export const confirmPendingReceptionValidator = vine.compile(
  vine.object({
    warehouseId: vine.string().uuid(),
    quantity: vine.number().positive().optional(),
  })
)
