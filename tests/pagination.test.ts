import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildCursorPagination,
  buildLimitOffsetPagination,
  cursorPaginationSchema,
  decodeCursor,
  encodeCursor,
  limitOffsetPaginationSchema,
} from '../src/utils/pagination.js';
import { ok } from '../src/utils/response.js';

describe('Pagination Utility (src/utils/pagination.ts)', () => {
  describe('Schema Validation - Limit & Offset Pagination', () => {
    it('applies default limit (20) and default offset (0) when omitted', () => {
      const parsed = limitOffsetPaginationSchema.parse({});
      expect(parsed.limit).toBe(DEFAULT_PAGE_SIZE);
      expect(parsed.offset).toBe(0);
    });

    it('accepts custom valid limit and offset', () => {
      const parsed = limitOffsetPaginationSchema.parse({ limit: '15', offset: '30' });
      expect(parsed.limit).toBe(15);
      expect(parsed.offset).toBe(30);
    });

    it('enforces maximum limit of 100', () => {
      const invalid = limitOffsetPaginationSchema.safeParse({ limit: '101' });
      expect(invalid.success).toBe(false);

      const validMax = limitOffsetPaginationSchema.parse({ limit: `${MAX_PAGE_SIZE}` });
      expect(validMax.limit).toBe(100);
    });

    it('rejects invalid limit values (0, negative, float, non-numeric)', () => {
      expect(limitOffsetPaginationSchema.safeParse({ limit: 0 }).success).toBe(false);
      expect(limitOffsetPaginationSchema.safeParse({ limit: -5 }).success).toBe(false);
      expect(limitOffsetPaginationSchema.safeParse({ limit: 10.5 }).success).toBe(false);
      expect(limitOffsetPaginationSchema.safeParse({ limit: 'abc' }).success).toBe(false);
    });

    it('rejects negative offset values', () => {
      expect(limitOffsetPaginationSchema.safeParse({ offset: -1 }).success).toBe(false);
    });
  });

  describe('Schema Validation - Cursor Pagination', () => {
    it('applies default limit and optional cursor', () => {
      const parsed = cursorPaginationSchema.parse({});
      expect(parsed.limit).toBe(DEFAULT_PAGE_SIZE);
      expect(parsed.cursor).toBeUndefined();
    });

    it('accepts valid limit and string cursor', () => {
      const parsed = cursorPaginationSchema.parse({
        limit: 10,
        cursor: 'eyJpZCI6IjEyMyJ9',
      });
      expect(parsed.limit).toBe(10);
      expect(parsed.cursor).toBe('eyJpZCI6IjEyMyJ9');
    });

    it('enforces maximum limit on cursor schema', () => {
      expect(cursorPaginationSchema.safeParse({ limit: 150 }).success).toBe(false);
    });
  });

  describe('Cursor Encoding and Decoding', () => {
    it('encodes and decodes an object cursor payload accurately', () => {
      const payload = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        createdAt: '2026-10-02T12:00:00.000Z',
      };

      const encoded = encodeCursor(payload);
      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);

      const decoded = decodeCursor<typeof payload>(encoded);
      expect(decoded).toEqual(payload);
    });

    it('encodes and decodes primitive values (string, number)', () => {
      const stringCursor = encodeCursor('item-99');
      expect(decodeCursor<string>(stringCursor)).toBe('item-99');

      const numberCursor = encodeCursor(12345);
      expect(decodeCursor<number>(numberCursor)).toBe(12345);
    });

    it('gracefully returns null for invalid, corrupted, or empty cursors without throwing', () => {
      expect(decodeCursor(null)).toBeNull();
      expect(decodeCursor(undefined)).toBeNull();
      expect(decodeCursor('')).toBeNull();
      expect(decodeCursor('!!!not-valid-base64-json!!!')).toBeNull();
      expect(decodeCursor(Buffer.from('not valid json').toString('base64url'))).toBeNull();
    });
  });

  describe('buildLimitOffsetPagination Helper', () => {
    const mockItems = Array.from({ length: 10 }, (_, i) => ({ id: `id-${i + 1}`, name: `Item ${i + 1}` }));

    it('builds limit-offset result when more items exist (hasMore: true)', () => {
      const result = buildLimitOffsetPagination(mockItems, 50, { limit: 10, offset: 0 });

      expect(result.data).toHaveLength(10);
      expect(result.meta).toEqual({
        total: 50,
        limit: 10,
        offset: 0,
        hasMore: true,
      });
    });

    it('builds limit-offset result for last page (hasMore: false)', () => {
      const result = buildLimitOffsetPagination(mockItems.slice(0, 5), 25, { limit: 10, offset: 20 });

      expect(result.data).toHaveLength(5);
      expect(result.meta).toEqual({
        total: 25,
        limit: 10,
        offset: 20,
        hasMore: false,
      });
    });

    it('handles empty results correctly', () => {
      const result = buildLimitOffsetPagination([], 0, { limit: 20, offset: 0 });

      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({
        total: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
      });
    });

    it('integrates seamlessly with standard response envelope', () => {
      const result = buildLimitOffsetPagination(mockItems, 10, { limit: 10, offset: 0 });
      const response = ok(result.data, result.meta as unknown as Record<string, unknown>);

      expect(response).toEqual({
        success: true,
        data: mockItems,
        meta: {
          total: 10,
          limit: 10,
          offset: 0,
          hasMore: false,
        },
      });
    });
  });

  describe('buildCursorPagination Helper', () => {
    interface TestItem {
      id: string;
      createdAt: string;
      title: string;
    }

    const generateItems = (count: number): TestItem[] =>
      Array.from({ length: count }, (_, i) => ({
        id: `uuid-${i + 1}`,
        createdAt: new Date(1700000000000 + i * 1000).toISOString(),
        title: `Entry ${i + 1}`,
      }));

    it('first cursor page: slices to limit, returns hasMore true, and generates nextCursor', () => {
      const requestedLimit = 5;
      // Fetch requestedLimit + 1 (6 items) from database
      const fetchedItems = generateItems(6);

      const result = buildCursorPagination(
        fetchedItems,
        requestedLimit,
        (item) => ({ id: item.id, createdAt: item.createdAt }),
      );

      expect(result.data).toHaveLength(5);
      expect(result.data[0]?.id).toBe('uuid-1');
      expect(result.data[4]?.id).toBe('uuid-5');
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.limit).toBe(5);
      expect(result.meta.nextCursor).toBeDefined();

      // Verify nextCursor points to 5th item (last item of the returned page)
      const decodedCursor = decodeCursor<{ id: string; createdAt: string }>(result.meta.nextCursor);
      expect(decodedCursor?.id).toBe('uuid-5');
    });

    it('subsequent cursor page: uses decoded cursor to continue deterministic pagination', () => {
      const requestedLimit = 3;
      // Simulate page 2 fetched items (items 4, 5, 6, 7)
      const page2Fetched = generateItems(7).slice(3); // length 4

      const result = buildCursorPagination(
        page2Fetched,
        requestedLimit,
        (item) => ({ id: item.id, createdAt: item.createdAt }),
      );

      expect(result.data).toHaveLength(3);
      expect(result.data[0]?.id).toBe('uuid-4');
      expect(result.data[2]?.id).toBe('uuid-6');
      expect(result.meta.hasMore).toBe(true);

      const decodedNext = decodeCursor<{ id: string }>(result.meta.nextCursor);
      expect(decodedNext?.id).toBe('uuid-6');
    });

    it('last page: returns all remaining items, hasMore false, and nextCursor null', () => {
      const requestedLimit = 5;
      // Only 3 items remain (fewer than or equal to limit)
      const fetchedItems = generateItems(3);

      const result = buildCursorPagination(
        fetchedItems,
        requestedLimit,
        (item) => ({ id: item.id, createdAt: item.createdAt }),
      );

      expect(result.data).toHaveLength(3);
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.nextCursor).toBeNull();
      expect(result.meta.limit).toBe(5);
    });

    it('empty result: handles zero items with hasMore false and nextCursor null', () => {
      const result = buildCursorPagination(
        [],
        10,
        (item: TestItem) => item.id,
      );

      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.nextCursor).toBeNull();
      expect(result.meta.limit).toBe(10);
    });

    it('preserves deterministic item ordering in the output array', () => {
      const items = generateItems(5);
      const result = buildCursorPagination(items, 4, (item) => item.id);

      expect(result.data.map((item) => item.id)).toEqual([
        'uuid-1',
        'uuid-2',
        'uuid-3',
        'uuid-4',
      ]);
    });

    it('integrates seamlessly with standard response envelope', () => {
      const items = generateItems(4);
      const result = buildCursorPagination(items, 3, (item) => item.id);
      const response = ok(result.data, result.meta as unknown as Record<string, unknown>);

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(3);
      expect(response.meta).toEqual({
        nextCursor: expect.any(String),
        hasMore: true,
        limit: 3,
      });
    });
  });
});
