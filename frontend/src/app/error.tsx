'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { captureException } from '@sentry/nextjs';
import { useLanguage } from '@/context/LanguageContext';

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: AppErrorProps) {
  const { t } = useLanguage();
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    const capturedId = captureException(error);
    setEventId(capturedId ?? error.digest ?? null);
  }, [error]);

  return (
    <html lang="tr">
      <body className="antialiased transition-colors duration-300 bg-[var(--background)] text-[var(--foreground)]">
        <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 text-center">
          <h1 className="text-3xl font-bold tracking-tight">{t('appErrorTitle')}</h1>
          <p className="max-w-xl text-sm text-muted-foreground">{t('appErrorDescription')}</p>
          {eventId ? (
            <p className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
              {t('appErrorEventId')}: {eventId}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {t('appErrorRetry')}
            </button>
            <Link
              href="/"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              {t('appErrorGoHome')}
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
