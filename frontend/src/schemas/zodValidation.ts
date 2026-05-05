import { z } from 'zod';
import { AppError } from '@/utils/errors';

export function parseOrValidationAppError<T>(schema: z.ZodType<T>, raw: unknown, code: string): T {
  const r = schema.safeParse(raw);
  if (r.success) return r.data;
  throw new AppError({
    message: r.error.message,
    category: 'validation',
    severity: 'minor',
    code,
    inlineMessage: r.error.issues.map((i) => i.message).join('; ') || 'Doğrulama hatası',
  });
}
