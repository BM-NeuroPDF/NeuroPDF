'use client';

import { SessionProvider } from 'next-auth/react';
import { Toaster } from 'sonner';
import type { ReactPdfJsWorkerModule } from '@/types/pdfjsWorker';
import { logError } from '@/utils/logger';

// PDF Worker yapılandırması - Global seviyede yap (tüm sayfalar için)
if (typeof window !== 'undefined') {
  import('react-pdf')
    .then((mod) => {
      const pdfjs = mod.pdfjs as ReactPdfJsWorkerModule;
      // Worker yapılandırmasını her zaman doğru CDN URL'i ile set et (yanlış değer varsa override et)
      const correctWorkerSrc = '/pdf.worker.mjs';
      const workerSrc = pdfjs.GlobalWorkerOptions.workerSrc;
      if (!workerSrc || workerSrc === 'pdf.worker.mjs' || !workerSrc.startsWith('http')) {
        pdfjs.GlobalWorkerOptions.workerSrc = correctWorkerSrc;
      }
    })
    .catch((err) => {
      logError(err, { scope: 'Providers.pdfWorker' });
    });
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster position="top-center" richColors closeButton />
    </SessionProvider>
  );
}
