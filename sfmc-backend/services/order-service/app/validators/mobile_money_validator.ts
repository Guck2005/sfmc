import vine from '@vinejs/vine'
import { BENIN_MOBILE_MONEY_REGEX } from '#constants/benin_mobile_money_phone'

export const mobileMoneyInitValidator = vine.compile(
  vine.object({
    phone: vine.string().trim().regex(BENIN_MOBILE_MONEY_REGEX),
  })
)
