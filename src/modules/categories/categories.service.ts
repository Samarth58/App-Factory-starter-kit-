import { db as defaultDb } from '../../db/connection.js';
import {
  buildCursorPagination,
  buildLimitOffsetPagination,
  decodeCursor,
  type CursorPaginatedResult,
  type LimitOffsetPaginatedResult,
} from '../../utils/pagination.js';
import type {
  CreateCategoryInput,
  CategoryResponse,
  UpdateCategoryInput,
} from './categories.schema.js';
import {
  findManyCategoryWithCursor,
  findManyCategoryWithOffset,
  findCategoryById,
  insertCategory,
  softDeleteCategoryById,
  updateCategoryById,
  type CategoryRow,
} from './categories.repository.js';

export function toCategoryResponse(row: CategoryRow): CategoryResponse {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    displayOrder: row.displayOrder,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createCategory(
  userId: string,
  input: CreateCategoryInput,
  db = defaultDb,
): Promise<CategoryResponse> {
  const created = await insertCategory(userId, input, db);
  return toCategoryResponse(created);
}

export async function listCategoriesCursor(
  userId: string,
  options: { limit: number; cursor?: string },
  db = defaultDb,
): Promise<CursorPaginatedResult<CategoryResponse>> {
  const { limit, cursor } = options;
  const decoded = decodeCursor<{ id: string; createdAt: string }>(cursor);
  const cursorDate = decoded?.createdAt ? new Date(decoded.createdAt) : undefined;

  const rows = await findManyCategoryWithCursor(
    userId,
    limit,
    cursorDate && decoded?.id ? { id: decoded.id, createdAt: cursorDate } : undefined,
    db,
  );

  const mapped = rows.map(toCategoryResponse);

  return buildCursorPagination(mapped, limit, (item) => ({
    id: item.id,
    createdAt: item.createdAt,
  }));
}

export async function listCategoriesLimitOffset(
  userId: string,
  options: { limit: number; offset: number },
  db = defaultDb,
): Promise<LimitOffsetPaginatedResult<CategoryResponse>> {
  const { limit, offset } = options;
  const { rows, total } = await findManyCategoryWithOffset(userId, limit, offset, db);
  const mapped = rows.map(toCategoryResponse);

  return buildLimitOffsetPagination(mapped, total, { limit, offset });
}

export async function getCategoryById(
  id: string,
  userId: string,
  db = defaultDb,
): Promise<CategoryResponse | null> {
  const row = await findCategoryById(id, userId, db);
  return row ? toCategoryResponse(row) : null;
}

export async function updateCategory(
  id: string,
  userId: string,
  input: UpdateCategoryInput,
  db = defaultDb,
): Promise<CategoryResponse | null> {
  const updated = await updateCategoryById(id, userId, input, db);
  return updated ? toCategoryResponse(updated) : null;
}

export async function deleteCategory(
  id: string,
  userId: string,
  db = defaultDb,
): Promise<boolean> {
  return softDeleteCategoryById(id, userId, db);
}
