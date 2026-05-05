import { describe, expect, it } from 'vitest';
import {
  AppError,
  createApiError,
  normalizeUnknownError,
  presentError,
} from '@/utils/errorPresenter';

describe('errorPresenter', () => {
  it('maps 422 into validation/minor inline-only flow', () => {
    const err = createApiError({
      statusCode: 422,
      detail: [{ msg: 'Field is required' }],
    });

    const presented = presentError(err);
    expect(presented.category).toBe('validation');
    expect(presented.severity).toBe('minor');
    expect(presented.shouldToast).toBe(false);
    expect(presented.inlineMessage).toContain('Field is required');
  });

  it('maps 500 into server/critical flow', () => {
    const err = createApiError({
      statusCode: 500,
      detail: 'Internal server error',
    });

    const presented = presentError(err);
    expect(presented.category).toBe('server');
    expect(presented.severity).toBe('critical');
    expect(presented.shouldToast).toBe(true);
  });

  it('normalizes network TypeError', () => {
    const normalized = normalizeUnknownError(new TypeError('fetch failed'));
    expect(normalized).toBeInstanceOf(AppError);
    expect(normalized.category).toBe('network');
    expect(normalized.severity).toBe('critical');
  });

  it('normalizes non-Error unknown into unknown.non_error', () => {
    const normalized = normalizeUnknownError('plain');
    expect(normalized.code).toBe('unknown.non_error');
  });

  it('presentError prefers userMessageKey when present on AppError', () => {
    const err = new AppError({
      message: 'x',
      category: 'unknown',
      severity: 'minor',
      userMessageKey: 'errorUnknownInline',
      inlineMessage: 'should not win',
    });
    const presented = presentError(err);
    expect(presented.inlineMessage).not.toBe('should not win');
  });
});
