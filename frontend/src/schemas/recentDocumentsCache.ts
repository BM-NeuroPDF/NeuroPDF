import { z } from 'zod';
import { AppError } from '@/utils/errors';

const RecentDocumentEntrySchema = z.union([
  z.string().min(1),
  z.object({
    id: z.string(),
    name: z.string().optional(),
  }),
]);

export const RecentDocumentsCacheSchema = z.array(RecentDocumentEntrySchema);

export type RecentDocumentsCachePayload = z.infer<typeof RecentDocumentsCacheSchema>;

export type RecentDocument = {
  id: string;
  name: string;
};

export function normalizeRecentDocuments(data: RecentDocumentsCachePayload): RecentDocument[] {
  return data
    .slice(0, 5)
    .map((item) =>
      typeof item === 'string'
        ? { id: item, name: item }
        : { id: item.id, name: item.name ?? item.id },
    );
}

export function parseRecentDocumentsCache(raw: unknown): RecentDocument[] {
  const r = RecentDocumentsCacheSchema.safeParse(raw);
  if (!r.success) {
    throw new AppError({
      message: r.error.message,
      category: 'validation',
      severity: 'minor',
      code: 'recent_documents.cache',
      inlineMessage: r.error.issues.map((i) => i.message).join('; ') || 'Geçersiz belge önbelleği',
    });
  }
  return normalizeRecentDocuments(r.data);
}
