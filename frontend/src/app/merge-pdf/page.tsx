'use client';

import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { useGuestLimit } from '@/hooks/useGuestLimit';
import UsageLimitModal from '@/components/UsageLimitModal';
import PdfToolDropzoneCard from '@/components/pdf-tools/PdfToolDropzoneCard';
import { usePdfActions, usePdfData } from '@/context/PdfContext';
import { useLanguage } from '@/context/LanguageContext';
import { useMergePdf } from '@/hooks/useMergePdf';

const MergeResultPanel = dynamic(() => import('@/components/merge-pdf/MergeResultPanel'), {
  loading: () => <div className="mt-6">{'Sonuç Yükleniyor...'}</div>,
});

export default function MergePdfPage() {
  const { data: session, status } = useSession();
  const { t } = useLanguage();
  const { pdfFile } = usePdfData();
  const { savePdf } = usePdfActions();

  const { usageInfo, showLimitModal, checkLimit, closeLimitModal, redirectToLogin } =
    useGuestLimit();

  const {
    files,
    processedBlob,
    merging,
    saving,
    getRootProps,
    getInputProps,
    isDragActive,
    handleSelect,
    handleDropFromPanel,
    removeFile,
    clearFiles,
    handleMergePdfs,
    handleDownload,
    handleSave,
    isReady,
    hasProcessed,
    currentError,
  } = useMergePdf({
    session,
    checkLimit,
    status,
    panelPdfFile: pdfFile,
    savePdf,
    t,
  });

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto font-bold text-[var(--foreground)]">
      <h1 className="text-3xl mb-6 tracking-tight">{t('mergePageTitle')}</h1>

      {usageInfo && !showLimitModal && !session && (
        <div className="info-box mb-4">{usageInfo.message}</div>
      )}

      {!hasProcessed && (
        <>
          <PdfToolDropzoneCard
            getRootProps={getRootProps}
            getInputProps={getInputProps}
            isDragActive={isDragActive}
            files={files}
            onRemove={removeFile}
            onClearAll={clearFiles}
            onSelect={handleSelect}
            multiple
            t={t}
            dropActiveLabel={t('dropFilesActive')}
            dropPassiveLabel={t('dropFilesPassive')}
            rootProps={{
              onDrop: (e: React.DragEvent<HTMLDivElement>) => {
                const isPanel = e.dataTransfer.getData('application/x-neuro-pdf');
                if (isPanel) {
                  handleDropFromPanel(e);
                }
              },
            }}
          />
          {files.length > 0 && (
            <p
              className="text-sm opacity-50 font-normal mt-2"
              style={{ color: 'var(--foreground)' }}
            >
              {t('mergeOrderHint')}
            </p>
          )}

          {/* Merge Butonu */}
          <button
            onClick={handleMergePdfs}
            disabled={!isReady || merging}
            className="btn-primary mt-6 w-full sm:w-auto px-8 py-3 shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {merging ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                {t('merging')}
              </>
            ) : (
              <>
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
                    d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                  />
                </svg>
                {t('mergeButton')}
              </>
            )}
          </button>
        </>
      )}

      {/* ✅ HATA KUTUSU */}
      {currentError && (
        <div className="error-box mt-6 animate-in fade-in slide-in-from-top-2 duration-300">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-6 h-6 shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
              clipRule="evenodd"
            />
          </svg>
          <span>{currentError}</span>
        </div>
      )}

      {hasProcessed && processedBlob && (
        <MergeResultPanel
          blob={processedBlob}
          handleDownload={handleDownload}
          handleSave={handleSave}
          clearFiles={clearFiles}
          saving={saving}
          session={session}
          t={t}
        />
      )}

      <UsageLimitModal
        isOpen={showLimitModal}
        onClose={closeLimitModal}
        onLogin={redirectToLogin}
        usageCount={usageInfo?.usage_count}
        maxUsage={3}
      />
    </main>
  );
}
