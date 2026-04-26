import type { HttpContext } from '@adonisjs/core/http'
import Order from '#models/order'
import {
  createOrder,
  cancelOrder,
  transitionStatus,
  ServiceUnavailableError,
  InsufficientStockError,
  ProductNotFoundError,
  ProductCatalogUnavailableError,
  MissingWarehouseForShipmentError,
  ShipmentAllocationMismatchError,
  recordMobileMoneyPhoneForPayment,
  completeMobileMoneyPaymentStub,
  mobileMoneyInitMeta,
  OrderMobileMoneyStateError,
} from '#services/order_service'
import { InvalidTransitionError } from '#services/order_state_machine'
import { createOrderValidator, updateStatusValidator } from '#validators/order_validator'
import { mobileMoneyInitValidator } from '#validators/mobile_money_validator'
import {
  canAccessOrder,
  effectiveCustomerFilter,
  effectiveOrderCustomerId,
  isClientRole,
  type Principal,
} from '#policies/order_policy'
import {
  resolveCustomerDisplayNames,
  formatCustomerDisplay,
  fetchCustomerContact,
} from '#services/customer_contact'

/** Query `from` / `to` : jour calendaire local (YYYY-MM-DD), même logique que l’ancien filtre front. */
function parseOrderListDayStart(day: string): Date | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const t = new Date(`${day}T00:00:00`)
  return Number.isNaN(t.getTime()) ? null : t
}

function parseOrderListDayEnd(day: string): Date | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const t = new Date(`${day}T23:59:59.999`)
  return Number.isNaN(t.getTime()) ? null : t
}

function principalFrom(ctx: HttpContext): Principal | null {
  const auth = (ctx as any).auth as { id: string; role: string } | undefined
  return auth ? { id: auth.id, role: auth.role } : null
}

function forbid(ctx: HttpContext, message = "Accès refusé à cette commande") {
  return ctx.response.forbidden({ error: { code: 'FORBIDDEN', message } })
}

export default class OrdersController {
  /**
   * POST /api/v1/orders — déclenche la Saga
   */
  async store(ctx: HttpContext) {
    const { request, response } = ctx
    const principal = principalFrom(ctx)
    if (principal && isClientRole(principal.role)) {
      // On force l'identité — impossible pour un CLIENT de créer une commande
      // pour un autre customerId.
      const bodyCustomerId = (request.body() as any)?.customerId
      const forced = effectiveOrderCustomerId(principal, bodyCustomerId)
      request.updateBody({ ...request.body(), customerId: forced })
    }
    const payload = await request.validateUsing(createOrderValidator)
    try {
      const order = await createOrder(payload)
      return response.created({ data: order })
    } catch (err) {
      if (err instanceof ServiceUnavailableError) {
        return response.serviceUnavailable({
          error: { code: err.code, message: err.message },
        })
      }
      if (err instanceof InsufficientStockError) {
        return response.conflict({
          error: {
            code: err.code,
            message: err.message,
            details: {
              productId: err.productId,
              requested: err.requested,
              available: err.available,
            },
          },
        })
      }
      if (err instanceof ProductNotFoundError) {
        return response.notFound({
          error: { code: err.code, message: err.message, details: { productId: err.productId } },
        })
      }
      if (err instanceof ProductCatalogUnavailableError) {
        return response.serviceUnavailable({
          error: { code: err.code, message: err.message },
        })
      }
      throw err
    }
  }

  /**
   * POST /api/v1/orders/:id/mobile-money/init
   * Enregistre le numéro et renvoie les instructions webhook / intégration PSP.
   */
  async initMobileMoney(ctx: HttpContext) {
    const { params, request, response } = ctx
    const order = await Order.query().where('id', params.id).firstOrFail()
    if (!canAccessOrder(principalFrom(ctx), order)) return forbid(ctx)
    const body = await request.validateUsing(mobileMoneyInitValidator)
    try {
      const updated = await recordMobileMoneyPhoneForPayment(order.id, body.phone)
      return response.ok({
        data: updated,
        mobileMoney: mobileMoneyInitMeta(),
      })
    } catch (err) {
      if (err instanceof OrderMobileMoneyStateError) {
        return response.unprocessableEntity({
          error: { code: err.code, message: err.message },
        })
      }
      throw err
    }
  }

  /**
   * POST /api/v1/orders/:id/mobile-money/complete-local
   * Dev uniquement si ALLOW_PAYMENT_COMPLETE_LOCAL=true (contournement PSP).
   */
  async completeMobileMoneyLocal(ctx: HttpContext) {
    const { params, response } = ctx
    const order = await Order.query().where('id', params.id).firstOrFail()
    if (!canAccessOrder(principalFrom(ctx), order)) return forbid(ctx)
    try {
      const updated = await completeMobileMoneyPaymentStub(order.id)
      return response.ok({ data: updated })
    } catch (err) {
      if (err instanceof OrderMobileMoneyStateError) {
        if (err.code === 'LOCAL_PAYMENT_COMPLETE_DISABLED') {
          return response.forbidden({ error: { code: err.code, message: err.message } })
        }
        return response.unprocessableEntity({
          error: { code: err.code, message: err.message },
        })
      }
      throw err
    }
  }

  /**
   * GET /api/v1/orders
   */
  async index(ctx: HttpContext) {
    const { request, response } = ctx
    const page = request.input('page', 1)
    const limit = request.input('limit', 20)
    const status = request.input('status')
    const rawCustomerId = request.input('customerId')
    const fromDay = String(request.input('from', '')).trim()
    const toDay = String(request.input('to', '')).trim()

    const customerId = effectiveCustomerFilter(principalFrom(ctx), rawCustomerId)

    const query = Order.query().orderBy('created_at', 'desc')
    if (status) query.where('status', status)
    if (customerId) query.where('customer_id', customerId)

    const fromStart = parseOrderListDayStart(fromDay)
    if (fromStart) query.where('created_at', '>=', fromStart)
    const toEnd = parseOrderListDayEnd(toDay)
    if (toEnd) query.where('created_at', '<=', toEnd)

    const orders = await query.paginate(page, limit)
    const rows = orders.all()
    const labelByCustomer = await resolveCustomerDisplayNames(rows.map((o) => o.customerId))
    const data = rows.map((o) => ({
      ...o.serialize(),
      customerDisplayName:
        labelByCustomer.get(o.customerId) ?? formatCustomerDisplay(o.customerId, null),
    }))
    return response.ok({
      data,
      meta: {
        total: orders.total,
        perPage: orders.perPage,
        currentPage: orders.currentPage,
        lastPage: orders.lastPage,
      },
    })
  }

  /**
   * GET /api/v1/orders/:id
   */
  async show(ctx: HttpContext) {
    const { params, response } = ctx
    const order = await Order.query().where('id', params.id).preload('lines').firstOrFail()
    if (!canAccessOrder(principalFrom(ctx), order)) return forbid(ctx)
    const contact = await fetchCustomerContact(order.customerId)
    return response.ok({
      data: {
        ...order.serialize(),
        customerDisplayName: formatCustomerDisplay(order.customerId, contact),
      },
    })
  }

  /**
   * PUT /api/v1/orders/:id/status
   * (Réservé OPERATOR/ADMIN par le router — rappel: le middleware `role`
   *  protège déjà cette route.)
   */
  async updateStatus(ctx: HttpContext) {
    const { params, request, response } = ctx
    const payload = await request.validateUsing(updateStatusValidator)
    if (payload.status === 'SHIPPED') {
      const hasAllocs = !!(payload.allocations && payload.allocations.length > 0)
      if (!hasAllocs && !payload.warehouseId) {
        return response.unprocessableEntity({
          error: {
            code: 'SHIPMENT_TARGET_REQUIRED',
            message:
              'Pour expédier : warehouseId (mono-entrepôt) ou allocations (multi-entrepôts) est requis.',
          },
        })
      }
    }
    try {
      const order = await transitionStatus(
        params.id,
        payload.status,
        payload.status === 'SHIPPED'
          ? {
              warehouseId: payload.warehouseId,
              allocations:
                payload.allocations && payload.allocations.length > 0
                  ? payload.allocations
                  : undefined,
            }
          : undefined
      )
      return response.ok({ data: order })
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        return response.unprocessableEntity({
          error: { code: err.code, message: err.message },
        })
      }
      if (err instanceof MissingWarehouseForShipmentError) {
        return response.unprocessableEntity({
          error: { code: err.code, message: err.message },
        })
      }
      if (err instanceof ShipmentAllocationMismatchError) {
        return response.unprocessableEntity({
          error: { code: err.code, message: err.message },
        })
      }
      if (err instanceof InsufficientStockError) {
        return response.conflict({
          error: {
            code: err.code,
            message: err.message,
            details: {
              productId: err.productId,
              requested: err.requested,
              available: err.available,
            },
          },
        })
      }
      if (err instanceof ServiceUnavailableError) {
        return response.serviceUnavailable({
          error: { code: err.code, message: err.message },
        })
      }
      throw err
    }
  }

  /**
   * DELETE /api/v1/orders/:id — annulation + compensation Saga
   */
  async destroy(ctx: HttpContext) {
    return this.handleCancel(ctx)
  }

  /**
   * POST /api/v1/orders/:id/cancel — annulation spécifique
   */
  async cancel(ctx: HttpContext) {
    return this.handleCancel(ctx)
  }

  private async handleCancel(ctx: HttpContext) {
    const { params, response } = ctx
    const principal = principalFrom(ctx)
    if (principal && isClientRole(principal.role)) {
      const existing = await Order.find(params.id)
      if (!existing) return response.notFound({ error: { code: 'NOT_FOUND' } })
      if (!canAccessOrder(principal, existing)) return forbid(ctx)
    }
    try {
      const order = await cancelOrder(params.id)
      return response.ok({ data: order })
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        return response.unprocessableEntity({
          error: { code: err.code, message: err.message },
        })
      }
      throw err
    }
  }
}
