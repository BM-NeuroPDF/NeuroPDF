'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { translations } from '@/utils/translations';

export type SummarizePdfViewerProps = {
  file: File | string | Blob;
  height?: number | string;
};

const summarizePdfChunkLoading = () => <div className="animate-pulse bg-gray-200 rounded h-48" />;

const DynamicPdfViewer = dynamic(() => import('@/components/PdfViewer'), {
  ssr: false,
  loading: summarizePdfChunkLoading,
});

export interface SummarizePdfWorkAreaProps {
  file: File;
  summarizing: boolean;
  onSummarize: () => void;
  t: (key: keyof (typeof translations)['tr']) => string;
  /** Override for tests or to share one dynamic instance from the page. */
  pdfViewer?: ComponentType<SummarizePdfViewerProps>;
}

export function SummarizePdfWorkArea({
  file,
  summarizing,
  onSummarize,
  t,
  pdfViewer: PdfViewerComp = DynamicPdfViewer,
}: SummarizePdfWorkAreaProps) {
  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl overflow-hidden border border-[var(--container-border)] shadow-lg">
        <div className="p-4 border-b border-[var(--navbar-border)] bg-[var(--container-bg)]">
          <h3 className="text-xl font-semibold opacity-90">{t('pdfPreviewTitle')}</h3>
        </div>
        <PdfViewerComp file={file} height={550} />
      </div>

      <button
        type="button"
        onClick={() => void onSummarize()}
        disabled={summarizing}
        className="btn-primary w-full sm:w-auto px-8 py-3 shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-5 h-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 00-1.423 1.423z"
          />
        </svg>
        {t('summarizeButton') || 'Özetle'}
      </button>
    </div>
  );
}
