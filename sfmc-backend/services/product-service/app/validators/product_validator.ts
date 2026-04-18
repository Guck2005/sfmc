import vine from '@vinejs/vine'

export const createProductValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(255),
    category: vine.enum(['CIMENT', 'FER', 'BRIQUES', 'GRANULATS'] as const),
    unit: vine.string().trim().minLength(1).maxLength(50),
    description: vine.string().trim().optional(),
    unitPrice: vine.number().positive(),
    isActive: vine.boolean().optional(),
  })
)

export const updateProductValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(255).optional(),
    category: vine.enum(['CIMENT', 'FER', 'BRIQUES', 'GRANULATS'] as const).optional(),
    unit: vine.string().trim().optional(),
    description: vine.string().trim().optional(),
    unitPrice: vine.number().positive().optional(),
    isActive: vine.boolean().optional(),
  })
)
