import { describe, expect, it } from 'vitest';
import { fail, ok } from '../src/utils/response.js';

describe('Response Envelope Helpers', () => {
  it('ok helper produces standardized success envelope without meta when omitted', () => {
    const data = { id: '123', name: 'Test' };
    const response = ok(data);

    expect(response).toEqual({
      success: true,
      data: { id: '123', name: 'Test' },
    });
    expect(response).not.toHaveProperty('meta');
  });

  it('ok helper includes meta when provided', () => {
    const data = [{ id: '1' }, { id: '2' }];
    const meta = { nextCursor: 'abc', hasMore: false };
    const response = ok(data, meta);

    expect(response).toEqual({
      success: true,
      data: [{ id: '1' }, { id: '2' }],
      meta: { nextCursor: 'abc', hasMore: false },
    });
  });

  it('fail helper produces standardized error envelope with default empty details', () => {
    const response = fail('VALIDATION_ERROR', 'Field is required');

    expect(response).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Field is required',
        details: [],
      },
    });
  });

  it('fail helper includes details when provided', () => {
    const details = [{ field: 'email', issue: 'Invalid email' }];
    const response = fail('VALIDATION_ERROR', 'Validation failed', details);

    expect(response).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [{ field: 'email', issue: 'Invalid email' }],
      },
    });
  });
});
