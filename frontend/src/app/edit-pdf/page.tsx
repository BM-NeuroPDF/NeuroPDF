'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import type { FileRejection } from 'react-dropzone';
import dynamic from 'next/dynamic';

// DND-KIT İMPORTLARI (Grid yapısı için)
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { usePdf } from '@/context/PdfContext';
import { useGuestLimit } from '@/hooks/useGuestLimit';
import UsageLimitModal from '@/components/UsageLimitModal';
import { guestService } from '@/services/guestService';
import { useLanguage } from '@/context/LanguageContext';
import { sendRequest } from '@/utils/api';
import { getMaxUploadBytes } from '@/app/config/fileLimits';
import Popup from '@/components/ui/Popup';
import { usePopup } from '@/hooks/usePopup';
import type { ReactPdfJsWorkerModule } from '@/types/pdfjsWorker';
import type { translations } from '@/utils/translations';

// PDF Worker yapılandırmasını dynamic import içinde yap
const Document = dynamic(
  () =>
    import('react-pdf').then(async (mod) => {
      // #region agent log
      fetch(
        'http://127.0.0.1:7243/ingest/875b7ef5-8e65-4044-b050-49490fad64c5',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'edit-pdf/page.tsx:41',
            message: 'Dynamic import start',
            data: { hasWindow: typeof window !== 'undefined' },
            timestamp: Date.now(),
            runId: 'run1',
            hypothesisId: 'A',
          }),
        }
      ).catch(() => {});
      // #endregion
      // Worker yapılandırmasını burada yap (dynamic import içinde)
      // Bu, Document component'i yüklenmeden önce worker'ın yapılandırılmasını garanti eder
      if (typeof window !== 'undefined') {
        const pdfjs = mod.pdfjs as ReactPdfJsWorkerModule;
        // #region agent log
        fetch(
          'http://127.0.0.1:7243/ingest/875b7ef5-8e65-4044-b050-49490fad64c5',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              location: 'edit-pdf/page.tsx:46',
              message: 'Before worker config check',
              data: {
                hasWorkerSrc: !!pdfjs.GlobalWorkerOptions.workerSrc,
                currentWorkerSrc: pdfjs.GlobalWorkerOptions.workerSrc,
                version: pdfjs.version,
              },
              timestamp: Date.now(),
              runId: 'post-fix',
              hypothesisId: 'C',
            }),
          }
        ).catch(() => {});
        // #endregion
        // Worker yapılandırmasını her zaman doğru CDN URL'i ile set et (yanlış değer varsa override et)
        const correctWorkerSrc = '/pdf.worker.mjs';
        const workerSrc = pdfjs.GlobalWorkerOptions.workerSrc;
        if (
          !workerSrc ||
          workerSrc === 'pdf.worker.mjs' ||
          !workerSrc.startsWith('http')
        ) {
          pdfjs.GlobalWorkerOptions.workerSrc = correctWorkerSrc;
          // #region agent log
          fetch(
            'http://127.0.0.1:7243/ingest/875b7ef5-8e65-4044-b050-49490fad64c5',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                location: 'edit-pdf/page.tsx:49',
                message: 'Worker config set in dynamic import',
                data: {
                  workerSrc: pdfjs.GlobalWorkerOptions.workerSrc,
                  wasFixed: true,
                },
                timestamp: Date.now(),
                runId: 'post-fix',
                hypothesisId: 'E',
              }),
            }
          ).catch(() => {});
          // #endregion
        }
        // Worker config'i kontrol logu
        // #region agent log
        fetch(
          'http://127.0.0.1:7243/ingest/875b7ef5-8e65-4044-b050-49490fad64c5',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              location: 'edit-pdf/page.tsx:52',
              message: 'Before delay, checking worker',
              data: { workerSrc: pdfjs.GlobalWorkerOptions.workerSrc },
              timestamp: Date.now(),
              runId: 'post-fix2',
              hypothesisId: 'A',
            }),
          }
        ).catch(() => {});
        // #endregion
        // #region agent log
        fetch(
          'http://127.0.0.1:7243/ingest/875b7ef5-8e65-4044-b050-49490fad64c5',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              location: 'edit-pdf/page.tsx:55',
              message: 'After delay, before return Document',
              data: { workerSrc: pdfjs.GlobalWorkerOptions.workerSrc },
              timestamp: Date.now(),
              runId: 'post-fix2',
              hypothesisId: 'A',
            }),
          }
        ).catch(() => {});
        // #endregion
      }
      return mod.Document;
    }),
  { ssr: false }
);

const Page = dynamic(() => import('react-pdf').then((mod) => mod.Page), {
  ssr: false,
});

type PageItem = {
  id: string;
  pageNumber: number;
};

// Hata Kodları ENUM
type ErrorType =
  | 'NONE'
  | 'INVALID_TYPE'
  | 'SIZE_EXCEEDED'
  | 'CUSTOM'
  | 'EMPTY_PDF'
  | 'SELECT_PDF_FIRST'
  | 'REORDER_ERROR'
  | 'SAVE_ERROR'
  | 'PANEL_ERROR';

export default function EditPdfPage() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const { pdfFile, savePdf, refreshKey } = usePdf();

  // ✅ 1. Dil Desteği
  const { t } = useLanguage();
  const { popup, showError, close } = usePopup();

  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [, setNumPages] = useState(0);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [isProcessingDone, setIsProcessingDone] = useState(false);

  // ✅ 2. Hata State'i (Metin yerine Kod)
  const [errorType, setErrorType] = useState<ErrorType>('NONE');
  const [customErrorMsg, setCustomErrorMsg] = useState<string | null>(null);

  const isGuest = status !== 'authenticated';
  const maxBytes = getMaxUploadBytes(isGuest);

  const {
    usageInfo,
    showLimitModal,
    checkLimit,
    closeLimitModal,
    redirectToLogin,
  } = useGuestLimit();

  // DND-KIT SENSÖRLERİ
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // PDF options'ı memoize et (gereksiz reload'ları önlemek için)
  const pdfOptions = useMemo(
    () => ({
      cMapUrl: '/cmaps/',
      cMapPacked: true,
    }),
    []
  );

  const clearError = useCallback(() => {
    setErrorType('NONE');
    setCustomErrorMsg(null);
  }, []);

  const resetState = useCallback(
    (f: File) => {
      setFile(f);
      const url = URL.createObjectURL(f);
      setObjectUrl(url);
      setPages([]);
      setNumPages(0);
      clearError();
      setIsProcessingDone(false);
      setProcessedBlob(null);
    },
    [clearError]
  );

  // Sohbet / yan panel `savePdf` ile PDF güncellediğinde önizleme sırasını yenile
  useEffect(() => {
    if (pathname !== '/edit-pdf') return;
    if (!pdfFile || !file) return;
    if (pdfFile.name !== file.name) return;
    if (
      pdfFile.size === file.size &&
      pdfFile.lastModified === file.lastModified
    )
      return;
    resetState(pdfFile);
  }, [pathname, pdfFile, file, refreshKey, resetState]);

  // --- DROPZONE ---
  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      clearError();

      if (fileRejections.length > 0) {
        const rejection = fileRejections[0];
        const errorObj = rejection.errors[0];

        if (errorObj.code === 'file-invalid-type') {
          setErrorType('INVALID_TYPE');
        } else if (errorObj.code === 'file-too-large') {
          setErrorType('SIZE_EXCEEDED');
        } else {
          setErrorType('CUSTOM');
          setCustomErrorMsg(errorObj.message);
        }
        setFile(null);
        return;
      }

      if (acceptedFiles?.length) {
        const f = acceptedFiles[0];

        if (f.type !== 'application/pdf') {
          setFile(null);
          setErrorType('INVALID_TYPE');
          return;
        }

        if (f.size > maxBytes) {
          setFile(null);
          setErrorType('SIZE_EXCEEDED');
          return;
        }
        resetState(f);
      }
    },
    [maxBytes, resetState, clearError]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: maxBytes,
  });

  const handleDropFromPanel = (
    e?: React.DragEvent<HTMLDivElement> | React.MouseEvent<HTMLButtonElement>
  ) => {
    clearError();
    if (pdfFile) {
      if (pdfFile.type !== 'application/pdf') {
        setFile(null);
        setErrorType('INVALID_TYPE');
        return;
      }

      if (pdfFile.size > maxBytes) {
        setFile(null);
        setErrorType('SIZE_EXCEEDED');
        return;
      }
      resetState(pdfFile);
      if (e && 'stopPropagation' in e) {
        e.stopPropagation();
        e.preventDefault();
      }
    } else {
      setErrorType('PANEL_ERROR');
    }
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    clearError();
    const f = e.target.files?.[0];
    if (f) {
      if (
        f.type !== 'application/pdf' &&
        !f.name.toLowerCase().endsWith('.pdf')
      ) {
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
      resetState(f);
    }
    e.target.value = '';
  };

  const handleLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPages(
      Array.from({ length: numPages }, (_, i) => ({
        id: `page-${i + 1}`,
        pageNumber: i + 1,
      }))
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setPages((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        setIsProcessingDone(false);
        setProcessedBlob(null);

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleReset = () => {
    setFile(null);
    setObjectUrl(null);
    setPages([]);
    setNumPages(0);
    setIsProcessingDone(false);
    setProcessedBlob(null);
    clearError();
  };

  const handleProcessAndDownload = async () => {
    if (!file) {
      setErrorType('SELECT_PDF_FIRST');
      return;
    }
    const canProceed = await checkLimit();
    if (!canProceed) return;

    clearError();
    try {
      const formData = new FormData();
      formData.append('file', file);
      const pageOrder = pages.map((p) => p.pageNumber).join(',');
      formData.append('page_numbers', pageOrder);

      const blob = await sendRequest('/files/reorder', 'POST', formData, true);

      if (blob.size === 0) throw new Error('EMPTY_PDF');

      setProcessedBlob(blob);
      setIsProcessingDone(true);

      savePdf(
        new File([blob], `reordered_${file.name}`, { type: 'application/pdf' })
      );

      if (!session) {
        try {
          await guestService.incrementUsage();
        } catch (error) {
          console.error('Misafir sayaç hatası:', error);
        }
      }
    } catch (err: unknown) {
      console.error('Reorder Error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'EMPTY_PDF') setErrorType('EMPTY_PDF');
      else {
        setErrorType('REORDER_ERROR');
        setCustomErrorMsg(msg);
      }
    }
  };

  const handleSave = async () => {
    if (!processedBlob || !session || !file) return;
    setSaving(true);
    clearError();
    try {
      const filename = `reordered_${file.name}`;
      const fileToSave = new File([processedBlob], filename, {
        type: 'application/pdf',
      });

      const formData = new FormData();
      formData.append('file', fileToSave);
      formData.append('filename', filename);

      const result = await sendRequest(
        '/files/save-processed',
        'POST',
        formData,
        true
      );

      alert(`${t('saveSuccess')}\n${t('fileSize')}: ${result.size_kb} KB`);

      savePdf(fileToSave);
      handleReset();
    } catch (e: unknown) {
      console.error('Save Error:', e);
      setErrorType('SAVE_ERROR');
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!processedBlob || !file) return;
    const url = URL.createObjectURL(processedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reordered_${file.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ✅ Hata Mesajı Renderlayıcı
  const getErrorMessage = () => {
    if (customErrorMsg && errorType === 'CUSTOM') return customErrorMsg;
    if (customErrorMsg && errorType === 'REORDER_ERROR')
      return `${t('error')}: ${customErrorMsg}`;

    switch (errorType) {
      case 'INVALID_TYPE':
        return t('invalidFileType');
      case 'SIZE_EXCEEDED':
        return `${t('fileSizeExceeded')} (Max: ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`;
      case 'PANEL_ERROR':
        return t('panelPdfError');
      case 'SELECT_PDF_FIRST':
        return t('selectPdfFirst');
      case 'EMPTY_PDF':
        return t('emptyPdfError');
      case 'SAVE_ERROR':
        return t('saveError');
      case 'REORDER_ERROR':
        return t('reorderError');
      default:
        return null;
    }
  };

  const currentError = getErrorMessage();

  // Popup gösterimi – mevcut hata metni değiştikçe popup tetikle
  useEffect(() => {
    if (currentError) {
      showError(currentError);
    }
  }, [currentError, showError]);

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto font-bold text-[var(--foreground)]">
      <h1 className="text-3xl mb-6 tracking-tight">{t('editPageTitle')}</h1>

      {usageInfo && !showLimitModal && !session && (
        <div className="info-box mb-4">{usageInfo.message}</div>
      )}

      {currentError && (
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
          <span>{currentError}</span>
        </div>
      )}

      <div
        {...getRootProps()}
        onDrop={handleDropFromPanel}
        className={`container-card border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300
          ${
            isDragActive
              ? 'border-[var(--button-bg)] opacity-80 bg-[var(--background)]'
              : 'border-[var(--navbar-border)] hover:border-[var(--button-bg)]'
          }`}
      >
        <input {...getInputProps()} accept="application/pdf" />
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
              d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
            />
          </svg>
          {isDragActive ? (
            <p>{t('editDropActive')}</p>
          ) : (
            <p>{t('editDropPassive')}</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <label className="btn-primary cursor-pointer shadow-md hover:scale-105 flex items-center gap-2">
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
              d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
            />
          </svg>
          {t('selectFile')}
          <input
            type="file"
            accept="application/pdf"
            onChange={handleSelect}
            className="hidden"
          />
        </label>
      </div>

      {objectUrl && !isProcessingDone && (
        <>
          <div className="mt-8">
            <h3 className="text-xl font-semibold mb-4 opacity-90">
              {t('previewDragDrop')} ({pages.length} {t('page')})
            </h3>

            <Document
              key={objectUrl || 'no-url'}
              file={objectUrl}
              onLoadSuccess={handleLoadSuccess}
              onLoadError={(error) => {
                // #region agent log
                fetch(
                  'http://127.0.0.1:7243/ingest/875b7ef5-8e65-4044-b050-49490fad64c5',
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      location: 'edit-pdf/page.tsx:432',
                      message: 'Document load error',
                      data: {
                        error: error ? String(error) : 'null',
                        errorType: typeof error,
                        errorMessage:
                          error &&
                          typeof error === 'object' &&
                          'message' in error
                            ? String((error as Error).message)
                            : undefined,
                      },
                      timestamp: Date.now(),
                      runId: 'post-fix2',
                      hypothesisId: 'D',
                    }),
                  }
                ).catch(() => {});
                // #endregion
                console.error('PDF Document Error:', error);
              }}
              loading={<div className="p-6">{t('loading')}</div>}
              error={<div className="p-6 text-red-500">{t('pdfError')}</div>}
              className="flex justify-center"
              options={pdfOptions}
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={pages.map((p) => p.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className="flex flex-wrap gap-4 p-4 justify-start w-full">
                    {pages.map((p, index) => (
                      <SortablePageItem
                        key={p.id}
                        id={p.id}
                        pageNumber={p.pageNumber}
                        index={index}
                        t={t}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </Document>
          </div>

          <div className="mt-8 flex gap-4 flex-wrap justify-center sm:justify-start">
            <button
              onClick={handleProcessAndDownload}
              disabled={pages.length === 0}
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
              onClick={handleReset}
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
        </>
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
                onClick={handleDownload}
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
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary shadow-md hover:scale-105 disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? t('saving') : t('saveToFiles')}
                </button>
              )}
              <button
                onClick={handleReset}
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

      <UsageLimitModal
        isOpen={showLimitModal}
        onClose={closeLimitModal}
        onLogin={redirectToLogin}
        usageCount={usageInfo?.usage_count}
        maxUsage={3}
      />

      {/* GLOBAL POPUP */}
      <Popup
        type={popup.type}
        message={popup.message}
        open={popup.open}
        onClose={close}
      />
    </main>
  );
}

type EditPdfTranslate = (key: keyof (typeof translations)['tr']) => string;

function SortablePageItem({
  id,
  pageNumber,
  index,
  t,
}: {
  id: string;
  pageNumber: number;
  index: number;
  t: EditPdfTranslate;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="border rounded-xl overflow-hidden shadow-lg cursor-move transition-shadow hover:shadow-2xl flex-shrink-0 touch-none"
    >
      <div
        className="w-[190px]"
        style={{
          backgroundColor: 'var(--container-bg)',
          borderColor: 'var(--container-border)',
          color: 'var(--foreground)',
        }}
      >
        <div
          className="text-center text-xs py-2 border-b font-bold tracking-wide truncate px-1 select-none"
          style={{
            backgroundColor: 'var(--background)',
            borderColor: 'var(--navbar-border)',
          }}
        >
          {t('orderIndex')}: {index + 1} ({t('origPage')} {pageNumber})
        </div>

        <div className="flex justify-center bg-gray-200 dark:bg-gray-800 p-2 h-[240px] items-center overflow-hidden">
          <Page
            pageNumber={pageNumber}
            width={170}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            className="shadow-sm pointer-events-none select-none"
          />
        </div>
      </div>
    </div>
  );
}
