import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const cursorPaginationSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(MAX_PAGE_SIZE, `Limit cannot exceed ${MAX_PAGE_SIZE}`)
    .default(DEFAULT_PAGE_SIZE),
  cursor: z.string().trim().min(1).optional(),
});

export type CursorPaginationQuery = z.infer<typeof cursorPaginationSchema>;

export const limitOffsetPaginationSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(MAX_PAGE_SIZE, `Limit cannot exceed ${MAX_PAGE_SIZE}`)
    .default(DEFAULT_PAGE_SIZE),
  offset: z.coerce
    .number()
    .int()
    .min(0, 'Offset cannot be negative')
    .default(0),
});

export type LimitOffsetPaginationQuery = z.infer<
  typeof limitOffsetPaginationSchema
>;

export interface CursorPaginationMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface CursorPaginatedResult<T> {
  data: T[];
  meta: CursorPaginationMeta;
}

export interface LimitOffsetPaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface LimitOffsetPaginatedResult<T> {
  data: T[];
  meta: LimitOffsetPaginationMeta;
}

/**
 * Safely encodes cursor payload data into a URL-safe Base64 string.
 */
export function encodeCursor(payload: unknown): string {
  const jsonString = JSON.stringify(payload);
  return Buffer.from(jsonString, 'utf-8').toString('base64url');
}

/**
 * Safely decodes a Base64/base64url cursor string into the parsed payload.
 * Returns null if the cursor is invalid or unparseable.
 */
export function decodeCursor<T = Record<string, unknown>>(
  cursorString?: string | null,
): T | null {
  if (!cursorString || typeof cursorString !== 'string') {
    return null;
  }

  try {
    const rawString = Buffer.from(cursorString, 'base64url').toString('utf-8');
    const parsed = JSON.parse(rawString);
    if (parsed && typeof parsed === 'object') {
      return parsed as T;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

/**
 * Builds a cursor-paginated result from items fetched with (limit + 1).
 * Extracts nextCursor from the last item of the current page if more items exist.
 */
export function buildCursorPagination<T>(
  items: T[],
  limit: number,
  getCursorPayload: (item: T) => unknown,
): CursorPaginatedResult<T> {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const lastItem = data[data.length - 1];

  const nextCursor =
    hasMore && lastItem !== undefined
      ? encodeCursor(getCursorPayload(lastItem))
      : null;

  return {
    data,
    meta: {
      nextCursor,
      hasMore,
      limit,
    },
  };
}

/**
 * Builds a limit-offset paginated result from items, total count, and pagination options.
 */
export function buildLimitOffsetPagination<T>(
  items: T[],
  total: number,
  options: { limit: number; offset: number },
): LimitOffsetPaginatedResult<T> {
  const { limit, offset } = options;
  const hasMore = offset + items.length < total;

  return {
    data: items,
    meta: {
      total,
      limit,
      offset,
      hasMore,
    },
  };
}
