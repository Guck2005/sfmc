import vine from '@vinejs/vine'

export const loginValidator = vine.compile(
  vine.object({
    email: vine.string().email().normalizeEmail(),
    password: vine.string().minLength(6),
  })
)

export const refreshValidator = vine.compile(
  vine.object({
    refreshToken: vine.string(),
  })
)

export const registerValidator = vine.compile(
  vine.object({
    email: vine.string().email().normalizeEmail(),
    password: vine.string().minLength(8).maxLength(128),
    fullName: vine.string().trim().minLength(2).maxLength(120).optional(),
    role: vine.enum(['ADMIN', 'OPERATOR', 'CLIENT'] as const).optional(),
  })
)
