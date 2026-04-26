import vine from '@vinejs/vine'

/** URL absolue https ou chemin relatif renvoyé par POST …/upload-image (format affiné côté front Zod). */
const imageUrlField = vine
  .string()
  .trim()
  .maxLength(2048)
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : v))

export const createProductValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(255),
    category: vine.enum(['CIMENT', 'FER', 'BRIQUES', 'GRANULATS'] as const),
    unit: vine.string().trim().minLength(1).maxLength(50),
    description: vine.string().trim().optional(),
    imageUrl: imageUrlField,
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
    imageUrl: vine
      .string()
      .trim()
      .maxLength(2048)
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v === '' ? null : v)),
    unitPrice: vine.number().positive().optional(),
    isActive: vine.boolean().optional(),
  })
)
