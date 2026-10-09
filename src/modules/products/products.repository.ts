import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '../../db/connection.js';
import {
  products,
  type CreateProductInput,
  type ProductRow,
  type UpdateProductInput,
} from './products.schema.js';

export type { ProductRow };

export async function insertProduct(
  userId: string,
  input: CreateProductInput,
  db = defaultDb,
): Promise<ProductRow> {
  const [created] = await db
    .insert(products)
    .values({
      userId,
      ...input,
    })
    .returning();

  return created;
}

export async function findProductById(
  id: string,
  userId: string,
  db = defaultDb,
): Promise<ProductRow | null> {
  const [row] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.id, id),
        eq(products.userId, userId),
        isNull(products.deletedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function findManyProductWithCursor(
  userId: string,
  limit: number,
  cursor?: { id: string; createdAt: Date },
  db = defaultDb,
): Promise<ProductRow[]> {
  const conditions = [eq(products.userId, userId), isNull(products.deletedAt)];

  if (cursor && cursor.createdAt && cursor.id) {
    conditions.push(
      or(
        lt(products.createdAt, cursor.createdAt),
        and(eq(products.createdAt, cursor.createdAt), lt(products.id, cursor.id)),
      )!,
    );
  }

  return db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(desc(products.createdAt), desc(products.id))
    .limit(limit + 1);
}

export async function findManyProductWithOffset(
  userId: string,
  limit: number,
  offset: number,
  db = defaultDb,
): Promise<{ rows: ProductRow[]; total: number }> {
  const conditions = [eq(products.userId, userId), isNull(products.deletedAt)];

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(products)
    .where(and(...conditions));

  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(desc(products.createdAt), desc(products.id))
    .limit(limit)
    .offset(offset);

  return { rows, total };
}

export async function updateProductById(
  id: string,
  userId: string,
  input: UpdateProductInput,
  db = defaultDb,
): Promise<ProductRow | null> {
  const [updated] = await db
    .update(products)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(products.id, id),
        eq(products.userId, userId),
        isNull(products.deletedAt),
      ),
    )
    .returning();

  return updated ?? null;
}

export async function softDeleteProductById(
  id: string,
  userId: string,
  db = defaultDb,
): Promise<boolean> {
  const [deleted] = await db
    .update(products)
    .set({ deletedAt: sql`now()` })
    .where(
      and(
        eq(products.id, id),
        eq(products.userId, userId),
        isNull(products.deletedAt),
      ),
    )
    .returning({ id: products.id });

  return Boolean(deleted);
}
