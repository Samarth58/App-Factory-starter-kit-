import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '../../db/connection.js';
import {
  categories,
  type CreateCategoryInput,
  type CategoryRow,
  type UpdateCategoryInput,
} from './categories.schema.js';

export type { CategoryRow };

export async function insertCategory(
  userId: string,
  input: CreateCategoryInput,
  db = defaultDb,
): Promise<CategoryRow> {
  const [created] = await db
    .insert(categories)
    .values({
      userId,
      ...input,
    })
    .returning();

  return created;
}

export async function findCategoryById(
  id: string,
  userId: string,
  db = defaultDb,
): Promise<CategoryRow | null> {
  const [row] = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.id, id),
        eq(categories.userId, userId),
        isNull(categories.deletedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function findManyCategoryWithCursor(
  userId: string,
  limit: number,
  cursor?: { id: string; createdAt: Date },
  db = defaultDb,
): Promise<CategoryRow[]> {
  const conditions = [eq(categories.userId, userId), isNull(categories.deletedAt)];

  if (cursor && cursor.createdAt && cursor.id) {
    conditions.push(
      or(
        lt(categories.createdAt, cursor.createdAt),
        and(eq(categories.createdAt, cursor.createdAt), lt(categories.id, cursor.id)),
      )!,
    );
  }

  return db
    .select()
    .from(categories)
    .where(and(...conditions))
    .orderBy(desc(categories.createdAt), desc(categories.id))
    .limit(limit + 1);
}

export async function findManyCategoryWithOffset(
  userId: string,
  limit: number,
  offset: number,
  db = defaultDb,
): Promise<{ rows: CategoryRow[]; total: number }> {
  const conditions = [eq(categories.userId, userId), isNull(categories.deletedAt)];

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(categories)
    .where(and(...conditions));

  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select()
    .from(categories)
    .where(and(...conditions))
    .orderBy(desc(categories.createdAt), desc(categories.id))
    .limit(limit)
    .offset(offset);

  return { rows, total };
}

export async function updateCategoryById(
  id: string,
  userId: string,
  input: UpdateCategoryInput,
  db = defaultDb,
): Promise<CategoryRow | null> {
  const [updated] = await db
    .update(categories)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(categories.id, id),
        eq(categories.userId, userId),
        isNull(categories.deletedAt),
      ),
    )
    .returning();

  return updated ?? null;
}

export async function softDeleteCategoryById(
  id: string,
  userId: string,
  db = defaultDb,
): Promise<boolean> {
  const [deleted] = await db
    .update(categories)
    .set({ deletedAt: sql`now()` })
    .where(
      and(
        eq(categories.id, id),
        eq(categories.userId, userId),
        isNull(categories.deletedAt),
      ),
    )
    .returning({ id: categories.id });

  return Boolean(deleted);
}
