'use client';

import dynamic from 'next/dynamic';
import type { ComponentType, ReactNode } from 'react';
import { translations } from '@/utils/translations';

export type SummaryMarkdownViewerProps = {
  markdown: string;
  defaultPdfName?: string;
  height?: number | string;
};

const summarizeMarkdownChunkLoading = () => (
  <div className="animate-pulse bg-gray-200 rounded h-48" />
);

const DynamicMarkdownViewer = dynamic(() => import('@/components/MarkdownViewer'), {
  ssr: false,
  loading: summarizeMarkdownChunkLoading,
});

export interface SummaryResultPanelProps {
  summary: string;
  file: File | null;
  userRole: string | null;
  onNew: () => void;
  onDownloadPdf: () => void;
  onStartChat?: () => void;
  onRequestAudio?: () => void;
  audioUrl: string | null;
  audioLoading: boolean;
  audioPlayer: ReactNode;
  t: (key: keyof (typeof translations)['tr']) => string;
  /** Override for tests or to share one dynamic instance from the page. */
  markdownViewer?: ComponentType<SummaryMarkdownViewerProps>;
}

export function SummaryResultPanel({
  summary,
  file,
  userRole,
  onNew,
  onDownloadPdf,
  onStartChat,
  onRequestAudio,
  audioUrl,
  audioLoading,
  audioPlayer,
  t,
  markdownViewer: MarkdownViewerComp = DynamicMarkdownViewer,
}: SummaryResultPanelProps) {
  const isProUser = userRole?.toLowerCase() === 'pro' || userRole?.toLowerCase() === 'pro user';

  return (
    <div className="mt-6 space-y-6" data-filename={file?.name ?? ''}>
      <div className="container-card p-6 border border-gray-300 dark:border-[var(--container-border)] shadow-xl">
        <h3 className="text-xl mb-4 font-semibold border-b border-[var(--navbar-border)] pb-2">
          {t('summaryResultTitle') || 'Özet Sonucu'}
        </h3>
        <MarkdownViewerComp markdown={summary} height={400} />
      </div>

      <div className="container-card p-6 border border-gray-300 dark:border-[var(--container-border)] shadow-xl space-y-4">
        <h3 className="text-xl font-bold flex items-center gap-2 text-[var(--foreground)]">
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
          {t('processSuccess') || 'İşlem Başarılı'}
        </h3>

        <div className="flex gap-4 flex-wrap items-center mt-4 pb-2">
          <button
            type="button"
            onClick={onDownloadPdf}
            className="btn-primary flex items-center gap-2 shadow-md hover:scale-105"
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
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 12.75l-3-3m0 0l3-3m-3 3h7.5"
              />
            </svg>
            {t('downloadPdf') || 'PDF Olarak İndir'}
          </button>

          {onRequestAudio ? (
            <button
              type="button"
              onClick={() => void onRequestAudio()}
              disabled={audioLoading}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all shadow-md hover:scale-105 ${
                audioUrl || audioLoading
                  ? 'bg-[var(--button-bg)] text-white'
                  : 'bg-[var(--container-bg)] border border-[var(--navbar-border)] text-[var(--foreground)] hover:bg-[var(--button-bg)] hover:text-white'
              }`}
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
                  d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
                />
              </svg>
              {audioLoading
                ? t('loading') || 'Hazırlanıyor...'
                : t('listenSummary') || 'Özeti Dinle'}
            </button>
          ) : (
            <div className="relative group">
              <button
                type="button"
                disabled
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
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
                    d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                  />
                </svg>
                {t('listenSummary') || 'Özeti Dinle'}
              </button>
            </div>
          )}

          {onStartChat ? (
            <button
              type="button"
              onClick={onStartChat}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all shadow-md hover:scale-105 bg-indigo-600 hover:bg-indigo-700 text-white"
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
                  d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.159 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                />
              </svg>
              {isProUser
                ? t('chatButton' as keyof typeof translations.tr) || 'Sohbet Et'
                : t('upgradeToChat' as keyof typeof translations.tr) || "Sohbet için Pro'ya geç"}
            </button>
          ) : null}

          <button
            type="button"
            onClick={onNew}
            className="btn-primary flex items-center gap-2 shadow-md hover:scale-105"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t('newProcess') || 'Yeni İşlem'}
          </button>
        </div>

        {audioPlayer}
      </div>
    </div>
  );
}
