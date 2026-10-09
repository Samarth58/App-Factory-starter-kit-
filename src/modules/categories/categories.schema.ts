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

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    displayOrder: doublePrecision('display_order').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('categories_user_id_idx').on(table.userId),
    index('categories_created_at_idx').on(table.createdAt),
  ],
);

export type CategoryRow = typeof categories.$inferSelect;

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  description: z.string().trim().max(1000).optional(),
  displayOrder: z.coerce.number(),
  isActive: z.boolean(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z
  .object({
  name: z.string().trim().min(1, 'Name cannot be empty').max(255).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  displayOrder: z.coerce.number().optional(),
  isActive: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) => data.name !== undefined || data.description !== undefined || data.displayOrder !== undefined || data.isActive !== undefined,
    {
      message: 'At least one field must be provided for update',
    },
  );

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const categoriesPaginationQuerySchema = cursorPaginationSchema.extend({
  offset: z.coerce.number().int().min(0).optional(),
});

export type CategoryPaginationQuery = z.infer<typeof categoriesPaginationQuerySchema>;

export interface CategoryResponse {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
