'use client';

import { SessionProvider } from 'next-auth/react';
import { Toaster } from 'sonner';

// PDF Worker yapılandırması - Global seviyede yap (tüm sayfalar için)
if (typeof window !== 'undefined') {
  import('react-pdf')
    .then((mod) => {
      const pdfjs = mod.pdfjs;
      // Worker yapılandırmasını her zaman doğru CDN URL'i ile set et (yanlış değer varsa override et)
      const correctWorkerSrc = '/pdf.worker.mjs';
      if (
        !(pdfjs as any).GlobalWorkerOptions.workerSrc ||
        (pdfjs as any).GlobalWorkerOptions.workerSrc === 'pdf.worker.mjs' ||
        !(pdfjs as any).GlobalWorkerOptions.workerSrc.startsWith('http')
      ) {
        (pdfjs as any).GlobalWorkerOptions.workerSrc = correctWorkerSrc;
      }
    })
    .catch((err) => {
      console.error('PDF worker yapılandırılamadı:', err);
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
