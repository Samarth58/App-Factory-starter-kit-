import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '../../db/connection.js';
import { examples } from '../../db/schema.js';
import {
  buildCursorPagination,
  buildLimitOffsetPagination,
  decodeCursor,
  type CursorPaginatedResult,
  type LimitOffsetPaginatedResult,
} from '../../utils/pagination.js';
import type {
  CreateExampleInput,
  ExampleResponse,
  UpdateExampleInput,
} from './exampleSchemas.js';

export type ExampleRow = typeof examples.$inferSelect;

export function toExampleResponse(example: ExampleRow): ExampleResponse {
  return {
    id: example.id,
    userId: example.userId,
    name: example.name,
    description: example.description,
    createdAt: example.createdAt.toISOString(),
    updatedAt: example.updatedAt.toISOString(),
  };
}

export async function createExample(
  userId: string,
  input: CreateExampleInput,
  db = defaultDb,
): Promise<ExampleResponse> {
  const [created] = await db
    .insert(examples)
    .values({
      userId,
      name: input.name,
      description: input.description ?? null,
    })
    .returning();

  return toExampleResponse(created);
}

export async function listExamplesCursor(
  userId: string,
  options: { limit: number; cursor?: string },
  db = defaultDb,
): Promise<CursorPaginatedResult<ExampleResponse>> {
  const { limit, cursor } = options;
  const decoded = decodeCursor<{ id: string; createdAt: string }>(cursor);

  const conditions = [eq(examples.userId, userId), isNull(examples.deletedAt)];

  if (decoded && decoded.createdAt && decoded.id) {
    const cursorDate = new Date(decoded.createdAt);
    conditions.push(
      or(
        lt(examples.createdAt, cursorDate),
        and(eq(examples.createdAt, cursorDate), lt(examples.id, decoded.id)),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(examples)
    .where(and(...conditions))
    .orderBy(desc(examples.createdAt), desc(examples.id))
    .limit(limit + 1);

  const mapped = rows.map(toExampleResponse);

  return buildCursorPagination(mapped, limit, (item) => ({
    id: item.id,
    createdAt: item.createdAt,
  }));
}

export async function listExamplesLimitOffset(
  userId: string,
  options: { limit: number; offset: number },
  db = defaultDb,
): Promise<LimitOffsetPaginatedResult<ExampleResponse>> {
  const { limit, offset } = options;

  const conditions = [eq(examples.userId, userId), isNull(examples.deletedAt)];

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(examples)
    .where(and(...conditions));

  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select()
    .from(examples)
    .where(and(...conditions))
    .orderBy(desc(examples.createdAt), desc(examples.id))
    .limit(limit)
    .offset(offset);

  const mapped = rows.map(toExampleResponse);

  return buildLimitOffsetPagination(mapped, total, { limit, offset });
}

export async function getExampleById(
  id: string,
  userId: string,
  db = defaultDb,
): Promise<ExampleResponse | null> {
  const [row] = await db
    .select()
    .from(examples)
    .where(
      and(
        eq(examples.id, id),
        eq(examples.userId, userId),
        isNull(examples.deletedAt),
      ),
    )
    .limit(1);

  return row ? toExampleResponse(row) : null;
}

export async function updateExample(
  id: string,
  userId: string,
  input: UpdateExampleInput,
  db = defaultDb,
): Promise<ExampleResponse | null> {
  const updates: Partial<{
    name: string;
    description: string | null;
    updatedAt: Date;
  }> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    updates.name = input.name;
  }

  if (input.description !== undefined) {
    updates.description = input.description;
  }

  const [updated] = await db
    .update(examples)
    .set(updates)
    .where(
      and(
        eq(examples.id, id),
        eq(examples.userId, userId),
        isNull(examples.deletedAt),
      ),
    )
    .returning();

  return updated ? toExampleResponse(updated) : null;
}

export async function deleteExample(
  id: string,
  userId: string,
  db = defaultDb,
): Promise<boolean> {
  const [deleted] = await db
    .update(examples)
    .set({ deletedAt: sql`now()` })
    .where(
      and(
        eq(examples.id, id),
        eq(examples.userId, userId),
        isNull(examples.deletedAt),
      ),
    )
    .returning({ id: examples.id });

  return !!deleted;
}
