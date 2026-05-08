'use client';

import dynamic from 'next/dynamic';
import type { Session } from 'next-auth';
import type { TranslateFn } from '@/utils/translations';
import PdfToolResultActions from '@/components/pdf-tools/PdfToolResultActions';

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), {
  ssr: false,
});

type MergeResultPanelProps = {
  blob: Blob;
  handleDownload: () => void;
  handleSave: () => void;
  clearFiles: () => void;
  saving: boolean;
  session: Session | null | undefined;
  t: TranslateFn;
};

export default function MergeResultPanel({
  blob,
  handleDownload,
  handleSave,
  clearFiles,
  saving,
  session,
  t,
}: MergeResultPanelProps) {
  return (
    <div className="mt-6 space-y-6">
      <div className="container-card p-6">
        <h3 className="text-xl mb-4 font-semibold">{t('mergedPdfPreview')}</h3>
        <div className="rounded-lg overflow-hidden border border-[var(--navbar-border)]">
          <PdfViewer
            file={
              new File([blob], 'merged.pdf', {
                type: 'application/pdf',
              })
            }
            height={550}
          />
        </div>
      </div>

      <div className="container-card p-6 border border-gray-300 dark:border-[var(--container-border)] shadow-xl">
        <h3
          className="text-xl mb-4 font-bold flex items-center gap-2"
          style={{ color: 'var(--foreground)' }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6 text-green-500"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {t('mergeSuccessTitle')}
        </h3>

        <PdfToolResultActions
          onDownload={handleDownload}
          onSave={handleSave}
          onReset={clearFiles}
          saving={saving}
          session={session}
          t={t}
          saveLabelKey="save"
        />
      </div>
    </div>
  );
}
