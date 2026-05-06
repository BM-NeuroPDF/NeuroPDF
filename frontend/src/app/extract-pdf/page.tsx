'use client';

import { useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { useGuestLimit } from '@/hooks/useGuestLimit';
import { usePdfToolUpload, type PdfToolUploadError } from '@/hooks/usePdfToolUpload';
import { useProcessedFileActions } from '@/hooks/useProcessedFileActions';
import { useGuestGatedAction } from '@/hooks/useGuestGatedAction';
import UsageLimitModal from '@/components/UsageLimitModal';
import PdfToolDropzoneCard from '@/components/pdf-tools/PdfToolDropzoneCard';
import PdfToolResultActions from '@/components/pdf-tools/PdfToolResultActions';
import { usePdfActions, usePdfData } from '@/context/PdfContext';
import { useLanguage } from '@/context/LanguageContext';
import { sendRequest } from '@/utils/api';
import { getMaxUploadBytes } from '@/app/config/fileLimits';

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), {
  ssr: false,
});

type ErrorType =
  | 'NONE'
  | 'INVALID_TYPE'
  | 'SIZE_EXCEEDED'
  | 'CUSTOM'
  | 'UPLOAD_FIRST'
  | 'ENTER_PAGE_RANGE'
  | 'EXTRACT_ERROR'
  | 'SAVE_ERROR'
  | 'PANEL_ERROR';

export default function ExtractPdfPage() {
  const { data: session, status } = useSession();
  const { pdfFile } = usePdfData();
  const { savePdf } = usePdfActions();

  const { t } = useLanguage();

  const [file, setFile] = useState<File | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [pageRange, setPageRange] = useState('');
  const [extracting, setExtracting] = useState(false);

  const [errorType, setErrorType] = useState<ErrorType>('NONE');
  const [customErrorMsg, setCustomErrorMsg] = useState<string | null>(null);

  const isGuest = status !== 'authenticated';
  const maxBytes = getMaxUploadBytes(isGuest);

  const { usageInfo, showLimitModal, checkLimit, closeLimitModal, redirectToLogin } =
    useGuestLimit();
  const { runWithGuestCheck } = useGuestGatedAction({
    session,
    checkLimit,
    onError: (error) => console.error('Counter could not be updated:', error),
  });

  // 🎯 KRİTİK ÇÖZÜM: İşlenmiş Blob'u kararlı bir File objesine dönüştürüyoruz (Race condition'ı engeller)
  const processedFile = useMemo(() => {
    if (!processedBlob || !file) return null;
    const filename = file.name.replace('.pdf', '_extracted.pdf');
    return new File([processedBlob], filename, { type: 'application/pdf' });
  }, [processedBlob, file]);

  const clearError = () => {
    setErrorType('NONE');
    setCustomErrorMsg(null);
  };

  const handleUploadError = (uploadError: PdfToolUploadError) => {
    clearError();
    if (uploadError.code === 'INVALID_TYPE') {
      setFile(null);
      setErrorType('INVALID_TYPE');
      return;
    }
    if (uploadError.code === 'SIZE_EXCEEDED') {
      setFile(null);
      setErrorType('SIZE_EXCEEDED');
      return;
    }
    if (uploadError.code === 'PANEL_ERROR') {
      setErrorType('PANEL_ERROR');
      return;
    }
    setErrorType('CUSTOM');
    setCustomErrorMsg(uploadError.message ?? null);
  };

  const {
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
      if (!f) return;
      setFile(f);
      setProcessedBlob(null);
      setPageRange('');
    },
  });

  const { downloadBlob, saveProcessed, saving } = useProcessedFileActions({
    session,
    savePdf,
    onError: (e) => {
      console.error('Save Error:', e);
      setErrorType('SAVE_ERROR');
    },
  });

  const handleDropFromPanel = (
    e?: React.DragEvent<HTMLElement> | React.MouseEvent<HTMLElement>,
  ) => {
    clearError();
    if (pdfFile) {
      handleUploadFromPanel(pdfFile, e);
    } else {
      setErrorType('PANEL_ERROR');
    }
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    clearError();
    const f = e.target.files?.[0];
    if (f) {
      if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
        setFile(null);
        setErrorType('INVALID_TYPE');
        e.target.value = '';
        return;
      }

      if (f.size > maxBytes) {
        setFile(null);
        setErrorType('SIZE_EXCEEDED');
        e.target.value = '';
        return;
      }
      setFile(f);
      setProcessedBlob(null);
      setPageRange('');
    }
    e.target.value = '';
  };

  const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageRange(e.target.value);
  };

  const handleExtractPages = async () => {
    if (!file) {
      setErrorType('UPLOAD_FIRST');
      return;
    }
    if (!pageRange.trim()) {
      setErrorType('ENTER_PAGE_RANGE');
      return;
    }

    await runWithGuestCheck(async () => {
      clearError();
      setExtracting(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('page_range', pageRange.trim());
        const blob = await sendRequest<Blob>('/files/extract-pages', 'POST', formData, true);
        setProcessedBlob(blob);
        const safePageRange = pageRange.trim().replace(/[^a-zA-Z0-9-]/g, '_');
        const filename = file.name.replace('.pdf', `_extracted_${safePageRange}.pdf`);
        savePdf(new File([blob], filename, { type: 'application/pdf' }));
      } catch (e: unknown) {
        console.error('Page Extraction Error:', e);
        setErrorType('EXTRACT_ERROR');
        if (e instanceof Error) setCustomErrorMsg(e.message);
      } finally {
        setExtracting(false);
      }
    });
  };

  const handleDownload = async () => {
    if (!processedBlob) return;
    downloadBlob(processedBlob, 'extracted.pdf');
  };

  const handleSave = async () => {
    if (!processedBlob || !session) return;
    clearError();
    try {
      const safePageRange = pageRange.trim().replace(/[^a-zA-Z0-9-]/g, '_');
      const filename = file?.name.replace('.pdf', `_pages_${safePageRange}.pdf`) || 'extracted.pdf';
      const result = await saveProcessed({
        blob: processedBlob,
        filename,
        mimeType: 'application/pdf',
      });
      if (!result) return;

      alert(`${t('saveSuccess')}\n${t('fileSize')}: ${result.size_kb} KB`);
    } catch {}
  };

  const handleNew = () => {
    setFile(null);
    setProcessedBlob(null);
    setPageRange('');
    clearError();
  };

  const isReady = file && pageRange.trim().length > 0;
  const hasProcessed = processedBlob !== null;

  const getErrorMessage = () => {
    if (customErrorMsg && (errorType === 'CUSTOM' || errorType === 'EXTRACT_ERROR'))
      return customErrorMsg;

    switch (errorType) {
      case 'INVALID_TYPE':
        return t('invalidFileType');
      case 'SIZE_EXCEEDED':
        return `${t('fileSizeExceeded')} (Max: ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`;
      case 'PANEL_ERROR':
        return t('panelPdfError');
      case 'UPLOAD_FIRST':
        return t('uploadFirst');
      case 'ENTER_PAGE_RANGE':
        return t('enterPageRangeError');
      case 'EXTRACT_ERROR':
        return t('extractionFailed');
      case 'SAVE_ERROR':
        return t('saveError');
      default:
        return null;
    }
  };

  const currentError = getErrorMessage();

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto font-bold text-[var(--foreground)]">
      <h1 className="text-3xl mb-6 tracking-tight">{t('extractPageTitle')}</h1>

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
        dropActiveLabel={t('extractDropActive')}
        dropPassiveLabel={t('extractDropPassive')}
        currentFileHint={
          file ? `${t('currentFile')} ${file.name} - ${t('changeFileHint')}` : undefined
        }
        rootProps={{ onDrop: handleDropFromPanel }}
      />

      {/* Önizleme UI */}
      {file && (
        <div className={`relative ${hasProcessed ? 'hidden' : 'block'}`}>
          {extracting && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[var(--background)]/70 backdrop-blur-sm rounded-xl">
              <svg
                className="animate-spin mb-4 h-10 w-10 text-[var(--button-bg)]"
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
              <p className="text-xl font-bold">{t('extracting')}</p>
            </div>
          )}

          <div
            className={`mt-6 rounded-xl overflow-hidden border border-[var(--container-border)] shadow-lg transition-opacity duration-300 ${extracting ? 'pointer-events-none opacity-40' : ''}`}
          >
            <div
              className="p-4 border-b border-[var(--navbar-border)]"
              style={{ backgroundColor: 'var(--container-bg)' }}
            >
              <h3 className="text-xl font-semibold opacity-90">{t('pdfPreviewTitle')}</h3>
            </div>
            <PdfViewer file={file} height={550} />
          </div>

          <div
            className={`mt-6 flex flex-col gap-3 transition-opacity duration-300 ${extracting ? 'pointer-events-none opacity-40' : ''}`}
          >
            <label htmlFor="pageRange" className="text-lg font-bold">
              {t('pagesToExtractLabel')}
            </label>

            <input
              id="pageRange"
              type="text"
              placeholder={t('pageRangePlaceholder')}
              value={pageRange}
              onChange={handleRangeChange}
              className="px-4 py-3 rounded-xl border focus:ring-2 outline-none transition-colors"
              style={
                {
                  backgroundColor: 'var(--container-bg)',
                  color: 'var(--foreground)',
                  borderColor: 'var(--navbar-border)',
                  '--tw-ring-color': 'var(--button-bg)',
                } as React.CSSProperties
              }
            />

            <p className="text-sm opacity-60 font-normal">{t('pageRangeHint')}</p>

            <button
              onClick={handleExtractPages}
              disabled={!isReady || extracting}
              className="btn-primary mt-2 w-full sm:w-auto px-8 py-3 shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                  d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
                />
              </svg>
              {t('extractButton')}
            </button>
          </div>
        </div>
      )}

      {currentError && (
        <div className="error-box mt-6 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
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
          <span>{currentError}</span>
        </div>
      )}

      {/* Result Area */}
      {hasProcessed && processedFile && (
        <div className="mt-6 space-y-6">
          <div className="container-card p-6">
            <h3 className="text-xl mb-4 font-semibold">{t('extractedPdfPreviewTitle')}</h3>
            <div className="rounded-lg overflow-hidden border border-[var(--navbar-border)]">
              {/* 🎯 Sadece memoize edilmiş dosyayı (processedFile) gönderiyoruz */}
              <PdfViewer file={processedFile} height={550} />
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
              onReset={handleNew}
              saving={saving}
              session={session}
              t={t}
            />
          </div>
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
