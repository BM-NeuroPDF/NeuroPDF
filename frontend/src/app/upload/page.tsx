'use client';

import { useCallback, useState } from 'react';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { useUnifiedPdfDrop } from '@/hooks/useUnifiedPdfDrop';

import { useGuestLimit } from '@/hooks/useGuestLimit';
import UsageLimitModal from '@/components/UsageLimitModal';
import { usePdfActions } from '@/context/PdfContext';
import { useLanguage } from '@/context/LanguageContext';
import { getMaxUploadBytes } from '@/app/config/fileLimits';

import Popup from '@/components/ui/Popup';
import { usePopup } from '@/hooks/usePopup';

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), { ssr: false });

function isPdfFile(f: File): boolean {
  return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
}

export default function UploadPage() {
  const { data: session, status } = useSession();
  const { addPdfs } = usePdfActions();
  const { t } = useLanguage();

  const { popup, showError, showSuccess, showInfo, close } = usePopup();

  const [stagingFiles, setStagingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const isGuest = status !== 'authenticated';
  const maxBytes = getMaxUploadBytes(isGuest);

  const { usageInfo, showLimitModal, closeLimitModal, redirectToLogin } = useGuestLimit();

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: unknown[]) => {
      if (fileRejections.length > 0) {
        const rej = fileRejections[0] as {
          errors: { code: string; message: string }[];
        };
        const err = rej.errors[0];

        if (err.code === 'file-invalid-type') {
          showError(t('invalidFileType'));
          return;
        }

        if (err.code === 'file-too-large') {
          showError(t('fileSizeExceeded'));
          return;
        }

        showError(err.message);
        return;
      }

      if (!acceptedFiles?.length) return;

      const pdfs = acceptedFiles.filter(isPdfFile);
      if (pdfs.length === 0) {
        showError(t('invalidFileType'));
        return;
      }

      const oversized = pdfs.find((f) => f.size > maxBytes);
      if (oversized) {
        showError(t('fileSizeExceeded'));
        return;
      }

      setStagingFiles(pdfs);
    },
    [maxBytes, t, showError],
  );

  const { getRootProps, getInputProps, isDragActive } = useUnifiedPdfDrop({
    options: {
      multiple: true,
      accept: { 'application/pdf': ['.pdf'] },
      maxSize: maxBytes,
    },
    onFiles: onDrop,
  });

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';

    if (!list.length) return;

    const pdfs = list.filter(isPdfFile);
    if (pdfs.length === 0) {
      showError(t('invalidFileType'));
      return;
    }

    const oversized = pdfs.find((f) => f.size > maxBytes);
    if (oversized) {
      showError(t('fileSizeExceeded'));
      return;
    }

    setStagingFiles(pdfs);
  };

  const handleAddToPanel = () => {
    if (!stagingFiles.length) {
      showInfo(t('selectFile'));
      return;
    }

    setUploading(true);

    try {
      addPdfs(stagingFiles);
      setStagingFiles([]);
      showSuccess(t('uploadSuccess') || 'PDF added to panel');
    } catch {
      showError(t('uploadError') || 'Error adding file');
    } finally {
      setUploading(false);
    }
  };

  const previewFile = stagingFiles[0] ?? null;

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto font-bold text-[var(--foreground)]">
      <h1 className="text-3xl mb-6 tracking-tight">{t('uploadPageTitle')}</h1>

      {usageInfo && !showLimitModal && !session && (
        <div className="info-box mb-4">{usageInfo.message}</div>
      )}

      <div
        {...getRootProps()}
        className={`container-card border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300
        ${
          isDragActive
            ? 'border-[var(--button-bg)] bg-[var(--background)] opacity-80'
            : 'border-[var(--navbar-border)] hover:border-[var(--button-bg)]'
        }`}
      >
        <input {...getInputProps()} accept="application/pdf,.pdf" multiple />

        <div className="flex flex-col items-center gap-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-12 h-12 opacity-50"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>

          {isDragActive ? <p>{t('dropActive')}</p> : <p>{t('dropPassive')}</p>}
        </div>

        {stagingFiles.length > 0 && !isDragActive && (
          <p className="mt-4 text-sm opacity-60 font-normal">
            {t('pdfFilesSelectedCount')} <b>{stagingFiles.length}</b>
            {previewFile && (
              <>
                {' '}
                · {t('currentFile')} <b>{previewFile.name}</b>
                {stagingFiles.length > 1 ? ' …' : ''}
              </>
            )}
          </p>
        )}
      </div>

      <div className="mt-6 flex justify-start">
        <label className="btn-primary cursor-pointer shadow-md hover:scale-105 flex items-center gap-2">
          {t('selectFile')}
          <input
            type="file"
            className="hidden"
            accept=".pdf,application/pdf"
            multiple
            onChange={handleSelect}
          />
        </label>
      </div>

      {previewFile && (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl overflow-hidden border border-[var(--container-border)] shadow-lg">
            <PdfViewer file={previewFile} height={550} />
          </div>

          <button
            type="button"
            onClick={handleAddToPanel}
            disabled={uploading}
            className="btn-primary w-full sm:w-auto px-8 py-3 shadow-lg hover:scale-105"
          >
            {uploading ? t('uploading') || 'Uploading...' : t('uploadButton')}
          </button>
        </div>
      )}

      <UsageLimitModal
        isOpen={showLimitModal}
        onClose={closeLimitModal}
        onLogin={redirectToLogin}
        usageCount={usageInfo?.usage_count}
        maxUsage={3}
      />

      <Popup type={popup.type} message={popup.message} open={popup.open} onClose={close} />
    </main>
  );
}
