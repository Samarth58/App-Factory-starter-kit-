import { db as defaultDb } from '../../db/connection.js';
import {
  buildCursorPagination,
  buildLimitOffsetPagination,
  decodeCursor,
  type CursorPaginatedResult,
  type LimitOffsetPaginatedResult,
} from '../../utils/pagination.js';
import type {
  CreateProductInput,
  ProductResponse,
  UpdateProductInput,
} from './products.schema.js';
import {
  findManyProductWithCursor,
  findManyProductWithOffset,
  findProductById,
  insertProduct,
  softDeleteProductById,
  updateProductById,
  type ProductRow,
} from './products.repository.js';

export function toProductResponse(row: ProductRow): ProductResponse {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    price: row.price,
    inStock: row.inStock,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createProduct(
  userId: string,
  input: CreateProductInput,
  db = defaultDb,
): Promise<ProductResponse> {
  const created = await insertProduct(userId, input, db);
  return toProductResponse(created);
}

export async function listProductsCursor(
  userId: string,
  options: { limit: number; cursor?: string },
  db = defaultDb,
): Promise<CursorPaginatedResult<ProductResponse>> {
  const { limit, cursor } = options;
  const decoded = decodeCursor<{ id: string; createdAt: string }>(cursor);
  const cursorDate = decoded?.createdAt ? new Date(decoded.createdAt) : undefined;

  const rows = await findManyProductWithCursor(
    userId,
    limit,
    cursorDate && decoded?.id ? { id: decoded.id, createdAt: cursorDate } : undefined,
    db,
  );

  const mapped = rows.map(toProductResponse);

  return buildCursorPagination(mapped, limit, (item) => ({
    id: item.id,
    createdAt: item.createdAt,
  }));
}

export async function listProductsLimitOffset(
  userId: string,
  options: { limit: number; offset: number },
  db = defaultDb,
): Promise<LimitOffsetPaginatedResult<ProductResponse>> {
  const { limit, offset } = options;
  const { rows, total } = await findManyProductWithOffset(userId, limit, offset, db);
  const mapped = rows.map(toProductResponse);

  return buildLimitOffsetPagination(mapped, total, { limit, offset });
}

export async function getProductById(
  id: string,
  userId: string,
  db = defaultDb,
): Promise<ProductResponse | null> {
  const row = await findProductById(id, userId, db);
  return row ? toProductResponse(row) : null;
}

export async function updateProduct(
  id: string,
  userId: string,
  input: UpdateProductInput,
  db = defaultDb,
): Promise<ProductResponse | null> {
  const updated = await updateProductById(id, userId, input, db);
  return updated ? toProductResponse(updated) : null;
}

export async function deleteProduct(
  id: string,
  userId: string,
  db = defaultDb,
): Promise<boolean> {
  return softDeleteProductById(id, userId, db);
}
