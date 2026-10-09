import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { users } from '../../db/schema.js';
import {
  cursorPaginationSchema,
  limitOffsetPaginationSchema,
} from '../../utils/pagination.js';

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    price: doublePrecision('price').notNull(),
    inStock: boolean('in_stock').notNull().default(false),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('products_user_id_idx').on(table.userId),
    index('products_created_at_idx').on(table.createdAt),
  ],
);

export type ProductRow = typeof products.$inferSelect;

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  price: z.coerce.number(),
  inStock: z.boolean(),
  description: z.string().trim().max(1000).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
  name: z.string().trim().min(1, 'Name cannot be empty').max(255).optional(),
  price: z.coerce.number().optional(),
  inStock: z.boolean().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .refine(
    (data) => data.name !== undefined || data.price !== undefined || data.inStock !== undefined || data.description !== undefined,
    {
      message: 'At least one field must be provided for update',
    },
  );

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productsPaginationQuerySchema = cursorPaginationSchema.extend({
  offset: z.coerce.number().int().min(0).optional(),
});

export type ProductPaginationQuery = z.infer<typeof productsPaginationQuerySchema>;

export interface ProductResponse {
  id: string;
  userId: string;
  name: string;
  price: number;
  inStock: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}
