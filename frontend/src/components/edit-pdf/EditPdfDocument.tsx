'use client';

import dynamic from 'next/dynamic';
import type { ReactPdfJsWorkerModule } from '@/types/pdfjsWorker';

/**
 * Dynamic boundary: react-pdf + pdf.js worker must load only on the client.
 * M7/TW3: further splitting (e.g. lazy canvas only) can shrink first paint if needed.
 */
export const EditPdfDocument = dynamic(
  () =>
    import('react-pdf').then(async (mod) => {
      if (typeof window !== 'undefined') {
        const pdfjs = mod.pdfjs as ReactPdfJsWorkerModule;
        const correctWorkerSrc = '/pdf.worker.mjs';
        const workerSrc = pdfjs.GlobalWorkerOptions.workerSrc;
        if (!workerSrc || workerSrc === 'pdf.worker.mjs' || !workerSrc.startsWith('http')) {
          pdfjs.GlobalWorkerOptions.workerSrc = correctWorkerSrc;
        }
      }
      return mod.Document;
    }),
  { ssr: false },
);

export const EditPdfPage = dynamic(() => import('react-pdf').then((mod) => mod.Page), {
  ssr: false,
});
