import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import type { HttpContext } from '@adonisjs/core/http'
import Product from '#models/product'
import { createProductValidator, updateProductValidator } from '#validators/product_validator'

const UPLOAD_SUBDIR = 'storage/uploads/products'
const ASSET_NAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|gif|webp)$/i

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
}

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

  /**
   * POST /api/v1/products/upload-image — ADMIN, multipart field `file`.
   * Retourne une URL relative `/api/v1/products/assets/...` utilisable dans `imageUrl`.
   */
  async uploadImage({ request, response }: HttpContext) {
    const file = request.file('file', {
      size: '5mb',
      extnames: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    })

    if (!file) {
      return response.badRequest({
        error: {
          code: 'FILE_REQUIRED',
          message: 'Champ multipart « file » requis (image jpeg/png/gif/webp, max 5 Mo).',
        },
      })
    }

    if (!file.isValid) {
      const msg = file.errors.map((e) => e.message).join(' ') || 'Fichier invalide'
      return response.badRequest({ error: { code: 'INVALID_FILE', message: msg } })
    }

    const ext = (file.extname || '').replace(/^\./, '').toLowerCase()
    if (!['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      return response.badRequest({
        error: { code: 'INVALID_FILE', message: 'Extension non autorisée (jpg, png, gif, webp).' },
      })
    }

    if (!file.tmpPath) {
      return response.internalServerError({
        error: { code: 'UPLOAD_TMP_MISSING', message: 'Fichier temporaire indisponible.' },
      })
    }

    const filename = `${randomUUID()}.${ext}`
    const dir = app.makePath(UPLOAD_SUBDIR)
    await mkdir(dir, { recursive: true })
    const dest = join(dir, filename)
    await copyFile(file.tmpPath, dest)

    const url = `/api/v1/products/assets/${filename}`
    return response.ok({ data: { url } })
  }

  /**
   * GET /api/v1/products/assets/:name — lecture publique (aperçu catalogue / `<img>`).
   */
  async serveAsset({ params, response }: HttpContext) {
    const name = String(params.name || '')
    if (!ASSET_NAME_RE.test(name)) {
      return response.notFound()
    }
    const path = join(app.makePath(UPLOAD_SUBDIR), name)
    try {
      const buffer = await readFile(path)
      const ext = name.split('.').pop()?.toLowerCase() ?? ''
      const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream'
      response.header('Cache-Control', 'public, max-age=86400')
      return response.type(mime).send(buffer)
    } catch {
      return response.notFound()
    }
  }
}
