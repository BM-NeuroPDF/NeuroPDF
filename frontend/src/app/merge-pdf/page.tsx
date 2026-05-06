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
import { usePdfActions, usePdfData } from '@/context/PdfContext';
import { useLanguage } from '@/context/LanguageContext';
import { sendRequest } from '@/utils/api';
import { getMaxMergeTotalBytes, getMaxUploadBytes } from '@/app/config/fileLimits';

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), {
  ssr: false,
});

// ✅ Hata Kodları (INVALID_TYPE eklendi)
type ErrorType =
  | 'NONE'
  | 'INVALID_TYPE'
  | 'SIZE_EXCEEDED'
  | 'TOTAL_SIZE_EXCEEDED'
  | 'CUSTOM'
  | 'MERGE_MIN_FILES'
  | 'PANEL_ERROR'
  | 'FILE_ALREADY_IN_LIST'
  | 'MERGE_ERROR'
  | 'SAVE_ERROR';

export default function MergePdfPage() {
  const { data: session, status } = useSession();
  const { t } = useLanguage();
  const { pdfFile } = usePdfData();
  const { savePdf } = usePdfActions();

  const [files, setFiles] = useState<File[]>([]);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [merging, setMerging] = useState(false);

  const [errorType, setErrorType] = useState<ErrorType>('NONE');
  const [customErrorMsg, setCustomErrorMsg] = useState<string | null>(null);

  const isGuest = status !== 'authenticated';
  const maxBytesPerFile = getMaxUploadBytes(isGuest);
  const maxTotalBytes = getMaxMergeTotalBytes(isGuest);

  const { usageInfo, showLimitModal, checkLimit, closeLimitModal, redirectToLogin } =
    useGuestLimit();
  const { runWithGuestCheck } = useGuestGatedAction({
    session,
    checkLimit,
    onError: (error) => console.error('Misafir sayaç hatası:', error),
  });

  const clearError = () => {
    setErrorType('NONE');
    setCustomErrorMsg(null);
  };

  const clearFiles = () => {
    setFiles([]);
    setProcessedBlob(null);
    clearError();
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadError = (uploadError: PdfToolUploadError) => {
    clearError();
    if (uploadError.code === 'INVALID_TYPE') {
      setErrorType('INVALID_TYPE');
      return;
    }
    if (uploadError.code === 'SIZE_EXCEEDED') {
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
    onDrop,
    handleDropFromPanel: handleUploadFromPanel,
    getRootProps,
    getInputProps,
    isDragActive,
  } = usePdfToolUpload({
    maxBytes: maxBytesPerFile,
    allowedTypes: ['application/pdf', '.pdf'],
    onError: handleUploadError,
    onFilesAccepted: (acceptedFiles) => {
      const newFiles: File[] = [];
      let currentTotalSize = files.reduce((acc, f) => acc + f.size, 0);

      for (const file of acceptedFiles) {
        if (currentTotalSize + file.size > maxTotalBytes) {
          setErrorType('TOTAL_SIZE_EXCEEDED');
          return;
        }
        newFiles.push(file);
        currentTotalSize += file.size;
      }
      setFiles((prev) => [...prev, ...newFiles]);
    },
  });

  const { downloadBlob, saveProcessed, saving } = useProcessedFileActions({
    session,
    savePdf,
    onError: (e) => {
      console.error('❌ Save error:', e);
      setErrorType('SAVE_ERROR');
    },
  });

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      const newFilesList = Array.from(selectedFiles);
      onDrop(newFilesList, []);
    }
    e.target.value = '';
  };

  const handleDropFromPanel = (
    e?: React.DragEvent<HTMLDivElement> | React.MouseEvent<HTMLButtonElement>,
  ) => {
    clearError();
    if (pdfFile) {
      // Panelden gelen dosya için de tip kontrolü
      if (pdfFile.type !== 'application/pdf' && !pdfFile.name.toLowerCase().endsWith('.pdf')) {
        setErrorType('INVALID_TYPE');
        return;
      }

      if (pdfFile.size > maxBytesPerFile) {
        setErrorType('SIZE_EXCEEDED');
        return;
      }

      const currentTotalSize = files.reduce((acc, f) => acc + f.size, 0);
      if (currentTotalSize + pdfFile.size > maxTotalBytes) {
        setErrorType('TOTAL_SIZE_EXCEEDED');
        return;
      }

      const isAlreadyInList = files.some((f) => f.name === pdfFile.name && f.size === pdfFile.size);

      if (!isAlreadyInList) {
        handleUploadFromPanel(pdfFile, e);
      } else {
        setErrorType('FILE_ALREADY_IN_LIST');
        setCustomErrorMsg(pdfFile.name);
      }
    } else {
      setErrorType('PANEL_ERROR');
    }
  };

  // --- MERGE İŞLEMİ ---
  const handleMergePdfs = async () => {
    if (files.length < 2) {
      setErrorType('MERGE_MIN_FILES');
      return;
    }
    await runWithGuestCheck(async () => {
      clearError();
      setMerging(true);
      try {
        const formData = new FormData();
        files.forEach((file) => formData.append('files', file));
        const blob = await sendRequest<Blob>('/files/merge-pdfs', 'POST', formData, true);
        if (blob.size === 0) throw new Error('Received empty blob from server');
        setProcessedBlob(blob);
        savePdf(new File([blob], 'merged.pdf', { type: 'application/pdf' }));
      } catch (e: unknown) {
        console.error('❌ Birleştirme Hatası:', e);
        setErrorType('MERGE_ERROR');
      } finally {
        setMerging(false);
      }
    });
  };

  const handleDownload = async () => {
    if (!processedBlob) return;
    downloadBlob(processedBlob, 'merged.pdf');
  };

  // --- KAYDETME İŞLEMİ ---
  const handleSave = async () => {
    if (!processedBlob || !session) return;
    clearError();
    try {
      const filename = 'merged.pdf';
      const result = await saveProcessed({
        blob: processedBlob,
        filename,
        mimeType: 'application/pdf',
      });
      if (!result) return;

      alert(`${t('saveSuccess')}\n${t('fileSize')}: ${result.size_kb} KB`);
      clearFiles();
    } catch {}
  };

  const isReady = files.length >= 2;
  const hasProcessed = processedBlob !== null;

  // ✅ Hata Mesajı Renderlayıcı (Dil değişince burası yeniden çalışır)
  const getErrorMessage = () => {
    if (errorType === 'CUSTOM' && customErrorMsg) return customErrorMsg;

    switch (errorType) {
      case 'INVALID_TYPE':
        return t('invalidFileType'); // ✅ Artık çeviri dönecek
      case 'SIZE_EXCEEDED':
        return `${t('fileSizeExceeded')} (Max: ${(maxBytesPerFile / (1024 * 1024)).toFixed(0)} MB)`;
      case 'TOTAL_SIZE_EXCEEDED':
        return `${t('totalSizeExceeded')} (Max: ${(maxTotalBytes / (1024 * 1024)).toFixed(0)} MB)`;
      case 'PANEL_ERROR':
        return t('panelPdfError');
      case 'MERGE_MIN_FILES':
        return t('mergeMinFilesError');
      case 'FILE_ALREADY_IN_LIST':
        return `"${customErrorMsg}" ${t('fileAlreadyInList')}`;
      case 'MERGE_ERROR':
        return t('unknownMergeError');
      case 'SAVE_ERROR':
        return t('saveError');
      default:
        return null;
    }
  };

  const currentError = getErrorMessage();

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
        <div className="mt-6 space-y-6">
          <div className="container-card p-6">
            <h3 className="text-xl mb-4 font-semibold">{t('mergedPdfPreview')}</h3>
            <div className="rounded-lg overflow-hidden border border-[var(--navbar-border)]">
              <PdfViewer
                file={
                  new File([processedBlob], 'merged.pdf', {
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
