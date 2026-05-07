import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/utils/errors';
import { parseOrValidationAppError } from '@/schemas/zodValidation';

describe('parseOrValidationAppError', () => {
  it('returns parsed data when validation succeeds', () => {
    const schema = z.object({ id: z.string() });
    const out = parseOrValidationAppError(schema, { id: 'x' }, 'code.ok');
    expect(out).toEqual({ id: 'x' });
  });

  it('throws AppError with validation metadata when parsing fails', () => {
    const schema = z.object({ id: z.string().min(2, 'too-short') });
    expect(() => parseOrValidationAppError(schema, { id: 'x' }, 'code.fail')).toThrow(AppError);
    try {
      parseOrValidationAppError(schema, { id: 'x' }, 'code.fail');
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe('code.fail');
      expect(appErr.category).toBe('validation');
      expect(appErr.inlineMessage).toContain('too-short');
    }
  });
});
