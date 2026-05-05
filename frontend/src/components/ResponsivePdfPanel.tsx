'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { PanelRightOpen, X } from 'lucide-react';
import ClientPdfPanel, { CLIENT_PDF_PANEL_HIDDEN_PATHS } from '@/components/ClientPdfPanel';
import { usePdfData } from '@/context/PdfContext';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';

export default function ResponsivePdfPanel() {
  const pathname = usePathname();
  const { status } = useSession();
  const { pdfList } = usePdfData();
  const { t } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);

  const showChrome =
    !(CLIENT_PDF_PANEL_HIDDEN_PATHS as readonly string[]).includes(pathname) &&
    (pdfList.length > 0 || status === 'authenticated');

  if (!showChrome) return null;

  return (
    <div className="relative h-full w-0 flex-shrink-0 overflow-visible lg:w-80">
      <button
        type="button"
        className={cn(
          'lg:hidden fixed right-0 top-1/2 z-[851] -translate-y-1/2 rounded-l-xl border border-r-0 border-[var(--navbar-border)] bg-[var(--background)] px-1.5 py-3 shadow-md text-[var(--foreground)]',
          mobileOpen && 'hidden',
        )}
        onClick={() => setMobileOpen(true)}
        aria-label={t('mobilePdfPanelOpen')}
        data-testid="mobile-pdf-panel-trigger"
      >
        <PanelRightOpen className="h-5 w-5" aria-hidden />
      </button>

      {mobileOpen ? (
        <div
          className="lg:hidden fixed inset-0 z-[849] bg-black/40"
          aria-hidden
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div
        className={cn(
          'flex h-full w-80 max-w-[min(100vw,20rem)] flex-col bg-[var(--background)] shadow-xl transition-transform duration-300 ease-out',
          'fixed inset-y-0 right-0 z-[850] lg:relative lg:inset-auto lg:z-20 lg:max-w-none',
          /* Kapalı çekmece: tam genişlikte fixed katman — pointer-events-none olmadan trigger üstü bloklanır */
          mobileOpen ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none',
          'lg:translate-x-0 lg:pointer-events-auto',
        )}
      >
        <div
          className="lg:hidden flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2.5"
          style={{ borderColor: 'var(--navbar-border)' }}
        >
          <span className="text-sm font-semibold text-[var(--foreground)]">
            {t('mobilePdfPanelTitle')}
          </span>
          <button
            type="button"
            className="rounded-lg p-2 text-[var(--foreground)] hover:bg-[var(--container-bg)]"
            onClick={() => setMobileOpen(false)}
            aria-label={t('mobilePdfPanelClose')}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ClientPdfPanel />
        </div>
      </div>
    </div>
  );
}
