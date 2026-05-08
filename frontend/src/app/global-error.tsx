'use client';

/**
 * Root layout seviyesi hataları için App Router global error boundary.
 * Aktifken root layout yerine geçer; LanguageProvider vb. saran katmanlar burada yoktur —
 * metinler Türkçe sabit (varsayılan locale ile uyumlu).
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('@sentry/nextjs')
      .then(({ captureException }) => {
        if (cancelled) return;
        const capturedId = captureException(error);
        setEventId(capturedId ?? error.digest ?? null);
      })
      .catch(() => {
        if (!cancelled) setEventId(error.digest ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [error]);

  return (
    <html lang="tr">
      <body className="antialiased transition-colors duration-300 bg-[var(--background)] text-[var(--foreground)]">
        <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Bir şeyler ters gitti</h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin veya ana sayfaya dönün.
          </p>
          {eventId ? (
            <p className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
              Hata ID: {eventId}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Tekrar dene
            </button>
            <Link
              href="/"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Ana sayfa
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
