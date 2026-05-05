'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { parseRecentDocumentsCache, type RecentDocument } from '@/schemas/recentDocumentsCache';

const RECENT_DOCS_KEYS = ['neuropdf-recent-documents', 'recent-documents', 'last-viewed-documents'];

function readRecentDocuments(): RecentDocument[] {
  if (typeof window === 'undefined') return [];
  for (const key of RECENT_DOCS_KEYS) {
    try {
      const rawString = window.localStorage.getItem(key);
      if (!rawString) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawString);
      } catch {
        continue;
      }
      try {
        const normalized = parseRecentDocumentsCache(parsed);
        if (normalized.length > 0) return normalized;
      } catch {
        // Ignore malformed cache (Zod validation failure)
      }
    } catch {
      // Ignore malformed local data
    }
  }
  return [];
}

export default function NotFound() {
  const { t } = useLanguage();
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>([]);

  useEffect(() => {
    setRecentDocs(readRecentDocuments());
  }, []);

  return (
    <div className="mx-auto flex min-h-[65vh] w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="text-sm font-semibold text-muted-foreground">404</p>
      <h1 className="text-3xl font-bold tracking-tight">{t('notFoundTitle')}</h1>
      <p className="max-w-xl text-sm text-muted-foreground">{t('notFoundDescription')}</p>
      <Link
        href="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        {t('notFoundGoHome')}
      </Link>

      {recentDocs.length > 0 ? (
        <div className="w-full rounded-lg border border-border p-4 text-left">
          <p className="mb-2 text-sm font-semibold">{t('notFoundRecentDocs')}</p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {recentDocs.map((doc) => (
              <li key={doc.id}>
                <Link href="/documents" className="transition-colors hover:text-foreground">
                  {doc.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
