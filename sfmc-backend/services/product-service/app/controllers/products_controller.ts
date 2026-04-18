import type { HttpContext } from '@adonisjs/core/http'
import Product from '#models/product'
import { createProductValidator, updateProductValidator } from '#validators/product_validator'

export default class ProductsController {
  /**
   * GET /api/v1/products
   */
  async index({ request, response }: HttpContext) {
    const page = request.input('page', 1)
    const limit = request.input('limit', 20)
    const category = request.input('category')
    const isActive = request.input('isActive')

    const query = Product.query().orderBy('category').orderBy('name')

    if (category) query.where('category', category.toUpperCase())
    if (isActive !== undefined) query.where('is_active', isActive !== 'false')

    const products = await query.paginate(page, limit)
    return response.ok({
      data: products.all(),
      meta: { total: products.total, page: products.currentPage, lastPage: products.lastPage },
    })
  }

  /**
   * POST /api/v1/products — ADMIN
   */
  async store({ request, response }: HttpContext) {
    const payload = await request.validateUsing(createProductValidator)
    const product = await Product.create(payload)
    return response.created({ data: product })
  }

  /**
   * GET /api/v1/products/:id
   */
  async show({ params, response }: HttpContext) {
    const product = await Product.findOrFail(params.id)
    return response.ok({ data: product })
  }

  /**
   * PUT /api/v1/products/:id — ADMIN
   */
  async update({ params, request, response }: HttpContext) {
    const product = await Product.findOrFail(params.id)
    const payload = await request.validateUsing(updateProductValidator)
    product.merge(payload)
    await product.save()
    return response.ok({ data: product })
  }

  /**
   * DELETE /api/v1/products/:id — soft deactivate
   */
  async destroy({ params, response }: HttpContext) {
    const product = await Product.findOrFail(params.id)
    product.isActive = false
    await product.save()
    return response.ok({ data: { message: 'Produit désactivé', id: product.id } })
  }
}
