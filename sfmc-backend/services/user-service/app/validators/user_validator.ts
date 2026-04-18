import vine from '@vinejs/vine'

export const createUserValidator = vine.compile(
  vine.object({
    firstName: vine.string().trim().minLength(2).maxLength(100),
    lastName: vine.string().trim().minLength(2).maxLength(100),
    email: vine.string().email().normalizeEmail(),
    phone: vine.string().trim().optional(),
    role: vine.enum(['ADMIN', 'OPERATOR', 'CLIENT'] as const).optional(),
  })
)

export const updateUserValidator = vine.compile(
  vine.object({
    firstName: vine.string().trim().minLength(2).maxLength(100).optional(),
    lastName: vine.string().trim().minLength(2).maxLength(100).optional(),
    phone: vine.string().trim().optional(),
    isActive: vine.boolean().optional(),
  })
)

export const updateRoleValidator = vine.compile(
  vine.object({
    role: vine.enum(['ADMIN', 'OPERATOR', 'CLIENT'] as const),
  })
)
