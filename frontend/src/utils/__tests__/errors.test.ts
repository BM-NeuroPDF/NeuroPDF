import { describe, expect, it } from 'vitest';
import { AppError, isAppError, toAppError } from '@/utils/errors';

describe('errors (AppError helpers)', () => {
  it('isAppError is true only for AppError instances', () => {
    expect(isAppError(new AppError({ message: 'x', category: 'unknown', severity: 'minor' }))).toBe(
      true,
    );
    expect(isAppError(new Error('x'))).toBe(false);
    expect(isAppError(null)).toBe(false);
  });

  it('toAppError returns the same AppError instance', () => {
    const err = new AppError({
      message: 'm',
      category: 'auth',
      severity: 'critical',
      code: 'test',
    });
    expect(toAppError(err)).toBe(err);
  });

  it('toAppError wraps Error with message as inlineMessage', () => {
    const wrapped = toAppError(new Error('network down'));
    expect(wrapped.code).toBe('wrapped');
    expect(wrapped.inlineMessage).toBe('network down');
    expect(wrapped.cause).toBeInstanceOf(Error);
  });

  it('toAppError uses i18n key when Error message is empty', () => {
    const wrapped = toAppError(new Error(''));
    expect(wrapped.code).toBe('wrapped.empty_message');
    expect(wrapped.userMessageKey).toBe('errorUnknownInline');
  });

  it('toAppError treats whitespace-only Error message as empty', () => {
    const wrapped = toAppError(new Error('   \t'));
    expect(wrapped.code).toBe('wrapped.empty_message');
  });

  it('toAppError maps non-Error values with unknown code', () => {
    const wrapped = toAppError(42);
    expect(wrapped.code).toBe('unknown');
    expect(wrapped.userMessageKey).toBe('errorUnknownInline');
    expect(wrapped.cause).toBe(42);
  });
});
