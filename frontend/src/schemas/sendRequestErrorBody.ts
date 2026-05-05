import { z } from 'zod';
import { AppError } from '@/utils/errors';

export const SendRequestErrorBodySchema = z
  .object({
    detail: z.unknown().optional(),
  })
  .passthrough();

export type SendRequestErrorBody = z.infer<typeof SendRequestErrorBodySchema>;

/**
 * Plain objects: validate against {@link SendRequestErrorBodySchema}.
 * Null, arrays, and non-objects: no structured error body (returns null).
 * Malformed plain object: throws validation {@link AppError}.
 */
export function parseSendRequestErrorBody(raw: unknown): SendRequestErrorBody | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const r = SendRequestErrorBodySchema.safeParse(raw);
  if (!r.success) {
    throw new AppError({
      message: r.error.message,
      category: 'validation',
      severity: 'minor',
      code: 'api.error_body.shape',
      inlineMessage: r.error.issues.map((i) => i.message).join('; ') || 'Geçersiz API hata gövdesi',
    });
  }
  return r.data;
}

export function readOptionalDetailFromErrorJson(raw: unknown): unknown {
  const body = parseSendRequestErrorBody(raw);
  if (body === null) return undefined;
  return body.detail;
}
