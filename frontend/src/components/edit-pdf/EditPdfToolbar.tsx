'use client';

import type { Session } from 'next-auth';
import type { EditPdfTranslate } from './editPdfTypes';

type EditPdfToolbarProps = {
  objectUrl: string | null;
  isProcessingDone: boolean;
  processedBlob: Blob | null;
  pagesLength: number;
  session: Session | null;
  saving: boolean;
  onProcessAndDownload: () => void;
  onReset: () => void;
  onDownload: () => void;
  onSave: () => void;
  t: EditPdfTranslate;
};

export default function EditPdfToolbar({
  objectUrl,
  isProcessingDone,
  processedBlob,
  pagesLength,
  session,
  saving,
  onProcessAndDownload,
  onReset,
  onDownload,
  onSave,
  t,
}: EditPdfToolbarProps) {
  return (
    <>
      {objectUrl && !isProcessingDone && (
        <div className="mt-8 flex gap-4 flex-wrap justify-center sm:justify-start">
          <button
            type="button"
            onClick={onProcessAndDownload}
            disabled={pagesLength === 0}
            className="btn-primary shadow-lg hover:scale-105 disabled:opacity-50 flex items-center gap-2"
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
            {t('processAndDownload')}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="btn-primary shadow-md hover:scale-105 flex items-center gap-2"
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
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            {t('newProcess')}
          </button>
        </div>
      )}

      {isProcessingDone && processedBlob && (
        <div className="mt-8 space-y-6">
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
              {t('reorderSuccess')}
            </h3>

            <div className="flex gap-4 flex-wrap">
              <button
                type="button"
                onClick={onDownload}
                className="btn-primary shadow-md hover:scale-105 flex items-center gap-2"
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
                {t('download')}
              </button>
              {session && (
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving}
                  className="btn-primary shadow-md hover:scale-105 disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? t('saving') : t('saveToFiles')}
                </button>
              )}
              <button
                type="button"
                onClick={onReset}
                className="btn-primary shadow-md hover:scale-105 flex items-center gap-2"
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
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
                {t('newProcess')}
              </button>
            </div>
            {!session && (
              <p className="mt-4 text-sm opacity-80">
                💡{' '}
                <a
                  href="/login"
                  className="underline font-bold"
                  style={{ color: 'var(--button-bg)' }}
                >
                  {t('loginWarning')}
                </a>
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
