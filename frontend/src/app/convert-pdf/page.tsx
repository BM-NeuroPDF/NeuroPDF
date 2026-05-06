'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { useGuestLimit } from '@/hooks/useGuestLimit';
import { usePdfToolUpload, type PdfToolUploadError } from '@/hooks/usePdfToolUpload';
import { useProcessedFileActions } from '@/hooks/useProcessedFileActions';
import { useGuestGatedAction } from '@/hooks/useGuestGatedAction';
import UsageLimitModal from '@/components/UsageLimitModal';
import PdfToolDropzoneCard from '@/components/pdf-tools/PdfToolDropzoneCard';
import PdfToolResultActions from '@/components/pdf-tools/PdfToolResultActions';
import { usePdfData } from '@/context/PdfContext';
import { useLanguage } from '@/context/LanguageContext';
import { sendRequest } from '@/utils/api';
import { getMaxUploadBytes } from '@/app/config/fileLimits'; // ✅ Limit ayarı

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), {
  ssr: false,
});

export default function ExtractTextPage() {
  const { data: session, status } = useSession();
  const { pdfFile } = usePdfData();
  const { t } = useLanguage();

  const [file, setFile] = useState<File | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ Limit Hesaplama
  const isGuest = status !== 'authenticated';
  const maxBytes = getMaxUploadBytes(isGuest);

  const { usageInfo, showLimitModal, checkLimit, closeLimitModal, redirectToLogin } =
    useGuestLimit();
  const { runWithGuestCheck } = useGuestGatedAction({
    session,
    checkLimit,
    onError: (error) => console.error('Sayaç güncellenemedi:', error),
  });

  const resetFileState = (newFile: File) => {
    setFile(newFile);
    setProcessedBlob(null);
    setError(null);
  };

  const handleUploadError = (uploadError: PdfToolUploadError) => {
    if (uploadError.code === 'SIZE_EXCEEDED') {
      setError(
        `${t('fileSizeExceeded') || 'Dosya boyutu sınırı aşıldı'} (Max: ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`,
      );
      setFile(null);
      return;
    }
    if (uploadError.code === 'INVALID_TYPE') {
      setError(t('invalidFileType'));
      setFile(null);
      return;
    }
    if (uploadError.code === 'PANEL_ERROR') {
      setError(t('panelPdfError'));
      return;
    }
    setError(uploadError.message ?? t('error'));
  };

  const {
    onDrop,
    handleDropFromPanel: handleUploadFromPanel,
    getRootProps,
    getInputProps,
    isDragActive,
  } = usePdfToolUpload({
    maxBytes,
    maxFiles: 1,
    allowedTypes: ['application/pdf', '.pdf'],
    onError: handleUploadError,
    onFilesAccepted: (acceptedFiles) => {
      const f = acceptedFiles[0];
      if (f) resetFileState(f);
    },
  });

  const { downloadBlob, saveProcessed, saving } = useProcessedFileActions({
    session,
    onError: (e) => {
      setError(e instanceof Error ? e.message : t('saveError'));
    },
  });

  // --- YAN PANEL KONTROLÜ ---
  const handleDropFromPanel = (
    e?: React.DragEvent<HTMLElement> | React.MouseEvent<HTMLElement>,
  ) => {
    if (pdfFile) {
      handleUploadFromPanel(pdfFile, e);
    } else {
      setError(t('panelPdfError'));
    }
  };

  // --- DOSYA SEÇ BUTONU KONTROLÜ ---
  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      onDrop([f], []);
    }
    e.target.value = '';
  };

  const handleNewProcess = () => {
    setProcessedBlob(null);
    setFile(null);
    setError(null);
  };

  // --- 1. METNE ÇEVİRME İŞLEMİ ---
  const handleConvertText = async () => {
    if (!file) {
      setError(t('uploadFirst'));
      return;
    }

    await runWithGuestCheck(async () => {
      setError(null);
      setConverting(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const blob = await sendRequest<Blob>('/files/convert-text', 'POST', formData, true);
        setProcessedBlob(blob);
      } catch (e: unknown) {
        console.error('Metin Dönüştürme Hatası:', e);
        setError(e instanceof Error ? e.message : t('error'));
      } finally {
        setConverting(false);
      }
    });
  };

  const handleDownload = async () => {
    if (!processedBlob) return;
    downloadBlob(processedBlob, file?.name.replace('.pdf', '.txt') || 'converted.txt');
  };

  // --- 2. KAYDETME İŞLEMİ ---
  const handleSave = async () => {
    if (!processedBlob || !session) return;
    setError(null);
    try {
      const filename = file?.name.replace('.pdf', '_converted.txt') || 'converted.txt';
      const result = await saveProcessed({ blob: processedBlob, filename, mimeType: 'text/plain' });
      if (!result) return;

      alert(`${t('saveSuccess')}\n${t('fileSize')}: ${result.size_kb} KB`);
    } catch {}
  };

  const isReady = file !== null;
  const hasProcessed = processedBlob !== null;

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto font-bold text-[var(--foreground)]">
      <h1 className="text-3xl mb-6 tracking-tight">{t('pageTitle')}</h1>

      {usageInfo && !showLimitModal && !session && (
        <div className="info-box mb-4">{usageInfo.message}</div>
      )}

      <PdfToolDropzoneCard
        getRootProps={getRootProps}
        getInputProps={getInputProps}
        isDragActive={isDragActive}
        files={file ? [file] : []}
        t={t}
        onSelect={handleSelect}
        currentFileHint={file ? `${t('currentFile')} ${file.name}` : undefined}
        rootProps={{ onDrop: handleDropFromPanel }}
      />

      {file && !hasProcessed && (
        <div className="mt-6 rounded-xl overflow-hidden border border-[var(--container-border)] shadow-lg">
          <div
            className="p-4 border-b border-[var(--navbar-border)]"
            style={{ backgroundColor: 'var(--container-bg)' }}
          >
            <h3 className="text-xl font-semibold opacity-90">{t('activePdfTitle')}</h3>
          </div>
          <PdfViewer file={file} height={550} />
        </div>
      )}

      {/* Process Button */}
      {!hasProcessed && (
        <button
          onClick={handleConvertText}
          disabled={!isReady || converting}
          className="btn-primary mt-6 w-full sm:w-auto px-8 py-3 shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {converting ? (
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
              {t('converting')}
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
                  d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                />
              </svg>
              {t('convertText')}
            </>
          )}
        </button>
      )}

      {/* Processed Result */}
      {hasProcessed && processedBlob && (
        <div className="mt-6 space-y-6">
          {/* Text Preview */}
          <div
            className="rounded-xl overflow-hidden border border-[var(--container-border)] shadow-lg"
            style={{ backgroundColor: 'var(--container-bg)' }}
          >
            <div className="p-4 border-b border-[var(--navbar-border)]">
              <h3 className="text-xl font-semibold opacity-90">{t('textConvertedTitle')}</h3>
            </div>

            <div className="p-6">
              <div className="p-4 rounded-lg max-h-96 overflow-y-auto font-mono text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                <p className="text-gray-700 dark:text-gray-300">{t('textReadyMessage')}</p>
                <p className="text-gray-500 mt-2 opacity-60">
                  {t('fileSize')}: {(processedBlob.size / 1024).toFixed(2)} KB
                </p>
              </div>
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
              {t('processSuccess')}
            </h3>

            <PdfToolResultActions
              onDownload={handleDownload}
              onSave={handleSave}
              onReset={handleNewProcess}
              saving={saving}
              session={session}
              t={t}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="error-box mb-6 shadow-sm">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5 shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
              clipRule="evenodd"
            />
          </svg>

          <span>{error}</span>
        </div>
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
