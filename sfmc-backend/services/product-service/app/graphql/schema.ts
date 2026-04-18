import { ApolloServer } from '@apollo/server'
import db from '@adonisjs/lucid/services/db'

const typeDefs = `#graphql
  enum ProductCategory {
    CIMENT
    FER
    BRIQUES
    GRANULATS
  }

  type Product {
    id: ID!
    name: String!
    category: ProductCategory!
    unit: String!
    description: String
    unitPrice: Float!
    isActive: Boolean!
    createdAt: String!
  }

  type Query {
    products(category: ProductCategory, isActive: Boolean): [Product!]!
    product(id: ID!): Product
  }

  input CreateProductInput {
    name: String!
    category: ProductCategory!
    unit: String!
    description: String
    unitPrice: Float!
  }

  input UpdateProductInput {
    name: String
    category: ProductCategory
    unit: String
    description: String
    unitPrice: Float
    isActive: Boolean
  }

  type Mutation {
    createProduct(input: CreateProductInput!): Product!
    updateProduct(id: ID!, input: UpdateProductInput!): Product!
    deactivateProduct(id: ID!): Product!
  }
`

const resolvers = {
  Query: {
    async products(_: unknown, args: { category?: string; isActive?: boolean }) {
      const query = db.from('products').select('*').orderBy('category').orderBy('name')
      if (args.category) query.where('category', args.category)
      if (args.isActive !== undefined) query.where('is_active', args.isActive)
      const rows = await query
      return rows.map(mapProduct)
    },
    async product(_: unknown, args: { id: string }) {
      const row = await db.from('products').where('id', args.id).first()
      return row ? mapProduct(row) : null
    },
  },
  Mutation: {
    async createProduct(_: unknown, args: { input: Record<string, unknown> }) {
      const [row] = await db
        .table('products')
        .insert({
          name: args.input.name,
          category: args.input.category,
          unit: args.input.unit,
          description: args.input.description ?? null,
          unit_price: args.input.unitPrice,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*')
      return mapProduct(row)
    },
    async updateProduct(_: unknown, args: { id: string; input: Record<string, unknown> }) {
      const updates: Record<string, unknown> = { updated_at: new Date() }
      if (args.input.name !== undefined) updates.name = args.input.name
      if (args.input.category !== undefined) updates.category = args.input.category
      if (args.input.unit !== undefined) updates.unit = args.input.unit
      if (args.input.description !== undefined) updates.description = args.input.description
      if (args.input.unitPrice !== undefined) updates.unit_price = args.input.unitPrice
      if (args.input.isActive !== undefined) updates.is_active = args.input.isActive

      const [row] = await db.from('products').where('id', args.id).update(updates).returning('*')
      return mapProduct(row)
    },
    async deactivateProduct(_: unknown, args: { id: string }) {
      const [row] = await db
        .from('products')
        .where('id', args.id)
        .update({ is_active: false, updated_at: new Date() })
        .returning('*')
      return mapProduct(row)
    },
  },
}

function mapProduct(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    description: row.description,
    unitPrice: Number(row.unit_price),
    isActive: row.is_active,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }
}

export const apolloServer = new ApolloServer({ typeDefs, resolvers })
